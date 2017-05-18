/*!
* Mongoose neomongo Plugin
* Copyright(c) 2017 Diego Conti Santeri Tonini <diegosanteri@gmail.com>
* MIT Licensed
*/
'strict'

var neo4j = require('neo4j-driver').v1;
var jju = require('jju')

function neomongoosePlugin(schema, options) {

	var driver = neo4j.driver(options.connectURI, neo4j.auth.basic(options.user, options.password));


	schema.statics.insertDocNode = function insertDocNode(config, callback) {
		var self = this;

		var documentInfo = isValidDocument(config.document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}
		var document = config.document;

		if(document._id) {
			return callback({error: 'Invalid config', field: '_id'});
		}


		documentInfo = isValidOnlyOneNode(config.node);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}
		var node = config.node;

		var modelInstance = new self(document)
		modelInstance.save(function(err, documentInserted){

			if (err || documentInserted === undefined) {
				return callback(err, undefined, undefined);
			}

			node.operation = 'insert';
			node.data.nodeData._id = documentInserted.id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e, undefined, undefined); 
			}

			neo4jExec(nodeString, function(obj){
				if(obj.summary.counters._stats.nodesCreated != 1) {
					throw {error: 'Unexpected error when saving to neo4j'};
				}
				callback(null, documentInserted);
			}, function(err){
				callback(err);
			});
		});
	}

	schema.statics.updateDocNode = function updateDocNode(config, callback) {
		var self = this;

		var document = config.document;
		var node = config.node;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		if(document._id === null || document._id === '' || document._id === undefined) {
			return callback({error: 'Invalid config', field: '_id'});
		}

		documentInfo = isValidOnlyOneNode(node);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		self.update({_id: document._id}, document, function(err, numAffected){

			if (err || numAffected === undefined) {
				return callback(err, undefined, undefined);
			}

			if (numAffected.n == 0) {
				return callback({error: 'Document not found'});
			}

			node.operation = 'update';
			node.data.nodeData._id = document._id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e); 
			}

			neo4jExec(nodeString, function(obj){
				if(obj.summary.counters._stats.propertiesSet == 0) {
					throw {error: 'Unexpected error when saving to neo4j'};
				}
				callback(null, {message: "Node was updated"});
			}, function(err){
				callback(err, undefined, undefined);
			});
		});
	}

	schema.statics.deleteDocNode = function deleteDocNode(config, callback) {
		var self = this;

		var document = config.document;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		if(document._id === undefined) {
			return callback({error: 'Invalid config', field: '_id'});
		}

		self.remove({_id: document._id}, function(err, obj){

			if (err) {
				return callback(err, undefined, undefined);
			}

			if (obj.result.n == 0) {
				return callback({error: 'Not Found'}, undefined);
			}

			var node = {data: {}};
			node.operation = 'removeNode';
			node.data.nodeData = {};
			node.data.nodeData._id = document._id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e); 
			}

			neo4jExec(nodeString, function(obj){
				if(obj.summary.counters._stats.nodesDeleted != 1) {
					throw {error: 'Unexpected error when saving to neo4j'};
				}
				callback(null, {message: "Node was deleted"});
			}, function(err){
				callback(err, undefined, undefined);
			});
		});
	}

	schema.statics.associateNodes = function associateNodes(config, callback) {
		var self = this;

		var node = config.node;
		var documentInfo = isValidParentSonNode(node);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		var nodes = [node.data.parentNode._id, node.data.sonNode._id];


		self.find({_id:nodes}, function(err, response){
			if (err || response === undefined) {
				return callback(err, undefined, undefined);
			}

			if(response === null) {
				return callback({error: "Nodes doesn't exist"}, undefined, undefined);
			}
			else {
				if(response.length < 2) {
					return callback({error: "Nodes doesn't exist"}, undefined, undefined);
				}
				else {
					node.operation = 'associate';

					var nodeString = ''
					try{
						nodeString = queryString(node);
					}
					catch(e) {
						return callback(e); 
					}

					neo4jExec(nodeString, function(obj){
						if(obj.summary.counters._stats.relationshipsCreated != 1) {
							throw {error: 'Unexpected error when saving to neo4j'};
						}
						callback(err, {Message: 'Nodes has associated with success'});
					}, function(err){
						callback(err);
					});
				}
			}
		});
	}

	schema.statics.disassociate = function disassociate(config, callback) {
		var self = this;

		var node = config.node;
		if(node.isMultiDelete) {
			self.find({_id: node.data.parentNode._id}, function(err, response){
				if (err || response === undefined) {
					return callback(err, undefined, undefined);
				}

				if(response === null) {
					return callback({error: "Node doesn't exist"}, undefined, undefined);
				}
				else {
					node.operation = 'disassociate';

					var nodeString = ''
					try{
						nodeString = queryString(node);
					}
					catch(e) {
						return callback(e); 
					}

					neo4jExec(nodeString, function(node){
						if(obj.summary.counters._stats.relationshipsDeleted == 0) {
							throw {error: 'Unexpected error when saving to neo4j'};
						}
						callback(err, {"Message": "Node has disassociated with success"});
					}, function(err){
						callback(err);
					})
				}
			})
		}
		else {
			var nodes = [node.data.parentNode._id, node.data.sonNode._id]
			self.find({_id: nodes}, function(err, response){
				if (err || response === undefined) {
					return callback(err, undefined, undefined);
				}

				if(response === null) {
					return callback({error: "Node doesn't exist"});
				}
				else {

					if(response.length < 2) {
						return callback({error: "Node doesn't exist"});
					}

					node.operation = 'disassociate';

					var nodeString = ''
					try{
						nodeString = queryString(node);
					}
					catch(e) {
						return callback(e); 
					}

					neo4jExec(nodeString, function(node){
						if(obj.summary.counters._stats.relationshipsDeleted != 1) {
							throw {error: 'Unexpected error when saving to neo4j'};
						}
						callback(err, {"Message": "Node has disassociated with success"});
					}, function(err){
						callback(err);
					})
				}
			})
		}
	}

	function neo4jExec(commandString, successCallback, errorCallback) {
		var session = driver.session();

		if(commandString === undefined || commandString === '' || commandString === ' ') {
			return errorCallback({error: 'message string is empty'})
		}

		session
		.run(commandString)
		.then(function(node){
			session.close();
			successCallback(node)
		})
		.catch(function(err){
			session.close();
			errorCallback(err);
		})
	}

	function  queryString (config) {

		var operation = "";


		if (config.operation === 'insert') {
			operation = 'CREATE(n:@label@ @data@) RETURN n';
			try{
				operation = operation.replace('@label@', config.labels.nodeLabel)
										.replace('@data@', convertJsonToCypher(config.data.nodeData))
			}
			catch(e){
				throw {error: 'Unexpected error has happened'};
			}
		}
		else if (config.operation === 'update') {
			try {
				operation = "MATCH (n:@label@ {_id: '@id@'}) SET n=@data@ RETURN n";
				operation = operation.replace('@label@', config.labels.nodeLabel)
										.replace('@id@', config.data.nodeData._id)
										.replace('@data@', convertJsonToCypher(config.data.nodeData));
			}
			catch(e){
				throw {error: 'Unexpected error has happened'};
			}

		}
		else if(config.operation === 'removeNode') {
			try{
				operation = "MATCH (m) WHERE m._id= '@_id@' WITH m OPTIONAL MATCH (m)-[r]-() DELETE m,r";
				operation = operation.replace('@_id@', config.data.nodeData._id);
			}
			catch(e){
				throw {error: 'Unexpected error has happened'};
			}
		}
		else if(config.operation === 'disassociate') {

			var direction = config.direction === undefined ? '' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw {error: "Relation direction is invalid"};
			}
			else {
				if(direction === '<') {
					leftDirection = direction;
				}
				else {
					rightDirection = direction;
				}
			}

			var relationName = config.relationName;
			if(relationName === undefined || relationName === null) {
				relationName = ''
			}

			try {
				if(config.isMultiDelete) {
					operation = "MATCH (p)@leftDirection@-[r:@relationName@]-@rightDirection@() WHERE p._id = '@_id@' DELETE r";
					operation = operation.replace('@_id@', config.data.parentNode._id)
											.replace('@leftDirection@', leftDirection)
											.replace('@rightDirection@', rightDirection)
											.replace('@relationName@', relationName);
				}
				else {
					console.log(config.data.parentNode)
					console.log(config.data.sonNode)

					operation = "MATCH (a:@parentLabel@ @parentNode@)@leftDirection@-[r:@relationName@]-@rightDirection@(b:@sonLabel@ @sonNode@) DELETE r";
					operation = operation.replace('@leftDirection@', leftDirection)
											.replace('@rightDirection@', rightDirection)
											.replace('@relationName@', relationName)
											.replace('@parentNode@', convertJsonToCypher(config.data.parentNode))
											.replace('@sonNode@', convertJsonToCypher(config.data.sonNode))
											.replace('@parentLabel@', config.labels.parentLabel)
											.replace('@sonLabel@', config.labels.sonLabel);
				}
			}
			catch(e){
				throw {error: 'Unexpected error has happened'};
			}
		}
		else if (config.operation === 'associate') {
			var direction = config.direction === undefined ? '' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw {error: "Relation direction is invalid"};
			}
			else {
				if(direction === '<') {
					leftDirection = direction;
				}
				else {
					rightDirection = direction;
				}
			}

			var relationNode = config.data.relationNode;
			if(relationNode === undefined || relationNode === null) {
				relationNode = ''
			}
			else {
				relationNode = convertJsonToCypher(relationNode);
			}

			var relationName = config.relationName;
			if(relationName === undefined || relationName === null) {
				relationName = ''
			}


			operation = "MATCH(m:@parentLabel@ {_id: '@parentNodeId@'}), (n:@sonLabel@ {_id: '@sonNodeId@'}) " +
						"MERGE(m) @leftDirection@-[:@relationName@ @relationNode@]-@rightDirection@ (n) RETURN m,n";


			try{
				operation = operation.replace('@relationName@', relationName)
										.replace('@relationNode@', relationNode)
										.replace('@leftDirection@', leftDirection)
										.replace('@rightDirection@', rightDirection)
										.replace('@parentLabel@', config.labels.parentLabel)
										.replace('@sonLabel@', config.labels.sonLabel)
										.replace('@parentNodeId@', config.data.parentNode._id)
										.replace('@sonNodeId@', config.data.sonNode._id);

			}
			catch(e){
				throw {error: 'Unexpected error has happened'};
			}
		}
		else if (config.operation = 'getRelationships') {

			var direction = config.direction === undefined ? '<' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw {error: "Relation direction is invalid"};
			}
			else {
				if(direction === '<') {
					leftDirection = direction;
				}
				else {
					rightDirection = direction;
				}
			}

			var depth = config.depth === undefined ? 0 : config.depth;
			var page = config.page === undefined ? 0 : config.page;
			var recordsPerPage = config.recordsPerPage === undefined ? 5 : config.recordsPerPage;
			var recordsToSkiṕ = page * recordsPerPage;
			var depthReplace = depth == 0 ? '' : ('1..' + depth - 1);
			var pathLength = (depth == 0 ? 0 : depth - 1);

			operation = "MATCH (n)@directionLeft@-[r]-@directionRight@(m) WHERE n._id='@_id@' " +
						"WITH DISTINCT m, r, n ORDER BY m._id SKIP @skip@ LIMIT @recordsPerPage@ " +
						"OPTIONAL MATCH p=((m)<-[*@depth@]-(q)) " +
						"WHERE NOT exists((q)<-[]-()) OR length(p)=@pathLength@ " +
						"RETURN nodes(p), relationships(p), m, r, n";


			try {
				operation = operation.replace("@directionLeft@", leftDirection)
										.replace("@directionRight@", rightDirection)
										.replace("@_id@", config.document._id)
										.replace("@skip@", recordsToSkiṕ)
										.replace("@recordsPerPage@", recordsPerPage)
										.replace("@depth@", depthReplace)
										.replace("@pathLength@", pathLength);

			}
			catch (e) {
				throw {error: 'Unexpected error has happened'};
			}

		}
		else {
			throw "Unexpected error has happened." + config.operation + "  operation doesn't exist";
		}
		return operation;
	}

	function convertJsonToCypher(json){
		return jju.stringify(json, {quote:"'", no_trailing_comma:true}).replace(/"/g,'\\x22')
	}

	function isValidDocument(document) {
		
		var status = false;

		if(document !== undefined  && document !== null) {
			if(Object.keys(document).length != 0) {
				status = true;
			}	
		}

		return {status: status, field: 'document'}
	}

	function isValidNode(node) {

		if(node === null) {
			return {status: false, field: 'configJson'};
		}

		if(node.labels === undefined || node.labels === '' || node.labels === ' ') {
			return {status: false, field: 'labels'};
		}

		if(node.data === undefined || node.data === null) {
			return {status: false, field: 'data'};
		}

		return {status: true};
	}

	function isValidOnlyOneNode(node){

		var nodeInfo = isValidNode(node);
		if(!nodeInfo.status){
			return nodeInfo;
		}


		if(node.data.nodeData === undefined || node.data.nodeData === null) {
			return {status: false, field: 'nodeData'};
		}

		if(node.labels.nodeLabel === undefined || node.labels.nodeLabel === null || node.labels.nodeLabel === '') {
			return {status: false, field: 'nodeLabel'};
		}

		return {status: true};
	}

	function isValidParentSonNode(node){

		var nodeInfo = isValidNode(node);
		if(!nodeInfo.status){
			return nodeInfo;
		}

		if(node.relationName === undefined || node.relationName  === null || node.relationName  === '') {
			return {status: false, field: 'relationName'};
		}

		if(node.data.parentNode === undefined || node.data.parentNode === null) {
			return {status: false, field: 'parentNode'};
		}

		if(node.data.parentNode._id === undefined || node.data.parentNode._id === null || node.data.parentNode._id === '') {
			return {status: false, field: 'parentNode'};
		}

		if(node.data.sonNode === undefined || node.data.sonNode === null) {
			return {status: false, field: 'sonNode'};
		}

		if(node.data.sonNode._id === undefined || node.data.sonNode._id === null) {
			return {status: false, field: 'sonNode'};
		}

		if(node.labels.parentLabel === undefined || node.labels.parentLabel === null || node.labels.parentLabel === '') {
			return {status: false, field: 'parentLabel'};
		}

		if(node.isMultiDelete === undefined || node.isMultiDelete === null || node.isMultiDelete === false) {
			if(node.labels.sonLabel === undefined || node.labels.sonLabel === null || node.labels.sonLabel === '') {
				return {status: false, field: 'sonLabel'};
			}
		}


		return {status: true};
	}

	schema.statics.getRelationships = function getRelationships(config, callback) {

		var __self = this;
		try {
			var document = config.document;
		}
		catch (e) {
			return callback({error: 'Invalid config', field: 'document'});
		}

		documentInfo = isValidDocument(document);

		if (!documentInfo) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		if (document._id === '' || document._id === null || document._id === undefined) {
			return callback({error: 'Invalid config', field: '_id'});
		}

		config.operation = 'getRelationships';

		var query;
		try {
			query = queryString(config); 
		} catch (err) {
			return callback(err);
		}

		var session = driver.session();

		session
		.run(query,{})
		.then(function(result) {
			session.close();

			var records = result.records;
			var ids = [];
			var Tree = {};

			for (var i = 0; i < records.length; i++) {

				var subTree = [];
				subTree.push(records[i]._fields[4].properties._id);

				if (records[i]._fields[0]) {
					var fields = records[i]._fields[0];
					for (var j = 0; j < fields.length; j++) {
						subTree.push(fields[j].properties._id)
					}
				} else {
					subTree.push(records[i]._fields[2].properties._id);
				}

				arrayToNested(subTree, Tree);

				ids = ids.concat(subTree);
			}

			__self.find({_id: ids}, function(err, docs) {
				if (err) {
					return callback(err, null);
				}


				try {
					populateTreeData(Tree, docs);
				} catch (err) {
					return callback(err, null);
				} 
				return callback(null, Tree);
			});
		})
		.catch(function(error) {
			session.close();
			return callback(error, null);
		});
	}

	function isInteger(data) {
		return (typeof data === 'number' && (data % 1)===0)
	}

	function arrayObjectIndexOf(myArray, searchTerm, property) {
		for(var i = 0, len = myArray.length; i < len; i++) {
			if (myArray[i][property] == searchTerm) return i;
		}
		return -1;
	}

	function arrayToNested(array, object) {

		var o = object
		for(var i = 0; i < array.length-1; i++) {

			if (!o._id) {
				try {
					o._id = {};
					o._id = array[i];
				} catch (err) {
					console.log(err);
				}
			}

			if (!o.relationships) {
				o.relationships = [];
			}

			if (arrayObjectIndexOf(o.relationships, array[i + 1], "_id") != -1) {
				o = o["relationships"][arrayObjectIndexOf(o.relationships, array[i+1], "_id")];
			} else {
				o.relationships.push({_id: array[i + 1]});
				o = o.relationships[o.relationships.length -1];
			}
		}
	}

	function populateTreeData(Tree, data) {

		var objectData = {};

		objectData = data[arrayObjectIndexOf(data, Tree._id, "_id")];
		Object.assign(Tree, objectData._doc);

		if (Tree.relationships) {
			for (var i = 0; i < Tree.relationships.length; i++) {
				populateTreeData(Tree.relationships[i], data);
			}
		}
	}
}

/**
* Expose `neomongoosePlugin`.
*/

module.exports = neomongoosePlugin;