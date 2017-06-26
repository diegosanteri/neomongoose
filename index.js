/*!
* Mongoose neomongo Plugin
* Copyright(c) 2017 Diego Conti Santeri Tonini <diegosanteri@gmail.com>
* MIT Licensed
*/
'strict'

var neo4j = require('neo4j-driver').v1;
var jju = require('jju')

function neomongoosePlugin(schema, options) {

  if (!schema.path('DELETED')) {
    schema.add({DELETED: {type: Boolean, default: false}});
  }

	var driver = neo4j.driver(options.connectURI, neo4j.auth.basic(options.user, options.password));
	var session = driver.session();

	session.run('RETURN 1').then(function() {}).catch(function(err) {
		throw new Error('Cannot connect to Neo4j');
	});

	schema.statics.insertDocNode = function insertDocNode(config, callback) {
		var self = this;

		var documentInfo = isValidDocument(config.document);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}
		var document = config.document;

		documentInfo = isValidOnlyOneNode(config.node);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}
		var node = config.node;

		var modelInstance = new self(document)
		modelInstance.save(function(err, documentInserted){

			if (err || documentInserted === undefined) {
				if (err.code === 11000) {
					return callback({error: 'duplicateKeyError', msg: err})
				}

				return callback({error: 'mongoError', msg: err});
			}

			node.operation = 'insert';
			node.data.nodeData._id = documentInserted.id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback({error: 'unexpectedError', msg:e});
			}

			neo4jExec(nodeString, function(obj){
				if(obj.summary.counters._stats.nodesCreated != 1) {
					self.remove({_id: documentInserted._id}, function(err) {
						return callback({error: 'mongoError', msg: err});
					});
				}
				return callback(undefined, documentInserted);
			}, function(err){
				self.remove({_id: documentInserted._id}, function(e) {
					if (e) {
						return callback({error: 'mongoError', msg: e});
					}
					return callback({error: 'neo4jError', msg: err});
				});
			});
		});
	}

	schema.statics.updateDocNode = function updateDocNode(config, callback) {
		var self = this;

		var document = config.document;
		var node = config.node;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		if(document._id === null || document._id === '' || document._id === undefined) {
			return callback({error: 'invalidConfigError', field: '_id'});
		}

		documentInfo = isValidOnlyOneNode(node);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		self.update({_id: document._id}, document, function(err, numAffected){

			if (err || numAffected === undefined) {
				return callback({error: 'mongoError', msg: err});
			}

			if (numAffected.n == 0) {
				return callback({error: 'notFound'});
			}

			node.operation = 'update';
			node.data.nodeData._id = document._id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback({error: 'unexpectedError', msg: e});
			}

			neo4jExec(nodeString, function(obj){
				callback(null, {message: "Node was updated"});
			}, function(err){
				callback({error: 'neo4jError', msg: err});
			});
		});
	}

	schema.statics.deleteDocNode = function deleteDocNode(config, callback) {
		var self = this;

		var document = config.document;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		if(document._id === undefined) {
			return callback({error: 'invalidConfigError', field: '_id'});
		}

		self.remove({_id: document._id}, function(err, obj){

			if (err) {
				return callback(err, undefined, undefined);
			}

			if (obj.result.n == 0) {
				return callback({error: 'notFound'}, undefined);
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
				return callback({error: 'unexpectedError', msg: e});
			}

			neo4jExec(nodeString, function(obj){
				callback(null, {message: "Node was deleted"});
			}, function(err){
				callback({error: 'neo4jError', msg: err});
			});
		});
	}

	schema.statics.softDeleteDocNode = function(config, callback) {
		var self = this;

		var document = config.document;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		if(document._id === undefined) {
			return callback({error: 'invalidConfigError', field: '_id'});
		}

		self.find({_id: document._id, DELETED:false}, function(err, docs){

			if (err) {
				return callback({error: 'mongoError', msg: err});
			}

			if (!docs || !docs.length || docs.length < 1) {
				return callback({error: 'notFound'});
			}

			docs[0].DELETED = true;

			docs[0].save(function(err) {

				if (err) {
					return callback({error: 'mongoError', msg: err});
				}

				var node = {data: {}};
				node.operation = 'softRemoveNode';
				node.data.nodeData = {};
				node.data.nodeData._id = document._id;

				var nodeString = ''
				try{
					nodeString = queryString(node);
				}
				catch(e) {
					return callback({error: 'unexpectedError', msg: e});
				}

				neo4jExec(nodeString, function(obj){
					return callback(null, {message: "Node was deleted"});
				}, function(err) {
					self.update({_id: docs[0]._id}, {DELETED: false}, function(e, numAffected) {
						if (e) {
							return callback({error: 'mongoError', msg: e});
						}
							return callback({error: 'neo4jError', msg: err})
					});
				});
			});
		});
	}

	schema.statics.associateNodes = function associateNodes(config, callback) {
		var self = this;

		var node = config.node;
		var documentInfo = isValidParentSonNode(node);
		if(!documentInfo.status) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		var nodes = [node.data.parentNode._id, node.data.sonNode._id];


		self.find({_id:nodes, DELETED: false}, function(err, response){
			if (err || response === undefined) {
				return callback(err, undefined, undefined);
			}

			if(response === null) {
				return callback({error: "notFound"});
			}
			else {
				if(response.length < 2) {
					return callback({error: "notFound"});
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
						if(!obj.records) {
							return callback({error: 'neo4jError', msg: 'Unexpected Error'});
						}
						return callback(null, {Message: 'Nodes has associated with success'});
					}, function(err){
						return callback({error: 'neo4jError', msg:err});
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
					return callback({error: 'mongoError', msg: err});
				}

				if(response === null) {
					return callback({error: "notFound"}, undefined, undefined);
				}
				else {
					node.operation = 'disassociate';

					var nodeString = ''
					try{
						nodeString = queryString(node);
					}
					catch(e) {
						return callback({error:'unexpectedError', msg: e});
					}

					neo4jExec(nodeString, function(node){
						callback(err, {"Message": "Node has disassociated with success"});
					}, function(err){
						callback({error: 'neo4jError', msg: err});
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
					return callback({error: "notFound"});
				}
				else {

					if(response.length < 2) {
						return callback({error: "notFound"});
					}

					node.operation = 'disassociate';

					var nodeString = ''
					try{
						nodeString = queryString(node);
					}
					catch(e) {
						return callback({error: 'unexpectedError', msg: e});
					}

					neo4jExec(nodeString, function(node){
						callback(err, {"Message": "Node has disassociated with success"});
					}, function(err){
						callback({error: 'neo4jError', msg: err});
					})
				}
			})
		}
	}

	schema.statics.getNode = function getNode(config, callback) {
		var self = this;


		var doc = config.document;

		self.find({_id: doc._id}, function(err, response) {
			if (err || response === undefined) {
				return callback(err, undefined, undefined);
			}

			if(response === null) {
				return callback({error: "notFound"});
			}
			else {

				if(response.DELETED) {
					return callback({error: "notFound"});
				}

				return callback(err, response);
			}
		})

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
				throw e;
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
				throw e;
			}

		}
		else if(config.operation === 'removeNode') {
			try{
				operation = "MATCH (m) WHERE m._id= '@_id@' WITH m OPTIONAL MATCH (m)-[r]-() DELETE m,r";
				operation = operation.replace('@_id@', config.data.nodeData._id);
			}
			catch(e){
				throw e;
			}
		}
		else if(config.operation === 'softRemoveNode') {
			try{
				operation = "MATCH (m) WHERE m._id= '@_id@' WITH m OPTIONAL MATCH (m)-[r]-() SET m.DELETED = true RETURN m";
				operation = operation.replace('@_id@', config.data.nodeData._id);
			}
			catch(e){
				throw e;
			}
		}
		else if(config.operation === 'disassociate') {

			var direction = config.direction === undefined ? '' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw new Error("Invalid relationship direction");
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
				throw e;
			}
		}
		else if (config.operation === 'associate') {
			var direction = config.direction === undefined ? '' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw new Error("Invalid relationship direction");
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
						"CREATE UNIQUE(m) @leftDirection@-[r:@relationName@]-@rightDirection@(n) " +
						"SET r = @relationNode@ RETURN r";


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
				throw e;
			}
		}
		else if (config.operation == 'getRelationships') {

			var direction = config.direction === undefined ? '<' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw new Error("Invalid relationship direction");
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
			var depthReplace = depth == 0 ? '' : ('1..' + depth);
			var pathLength = (depth == 0 ? 0 : depth - 1);

			operation = "MATCH (n)@directionLeft@-[r]-@directionRight@(m) "+
						"WHERE n._id='@_id@' " +
						"WITH DISTINCT m, r, n ORDER BY m._id SKIP @skip@ LIMIT @recordsPerPage@ " +
						"OPTIONAL MATCH p=((m)@directionLeft@-[*@depth@]-@directionRight@(q)) " +
						"WHERE NOT exists((q)@directionLeft@-[]-@directionRight@()) OR length(p)=@pathLength@ " +
						"RETURN nodes(p), relationships(p), m, r, n";

			try {
				operation = operation.replace(/@directionLeft@/g, leftDirection)
										.replace(/@directionRight@/g, rightDirection)
										.replace(/@_id@/g, config.document._id)
										.replace(/@skip@/g, recordsToSkiṕ)
										.replace(/@recordsPerPage@/g, recordsPerPage)
										.replace(/@depth@/g, depthReplace)
										.replace(/@pathLength@/g, pathLength);

			}
			catch (e) {
				throw e;
			}
		}
		else if (config.operation == 'getRelationshipsCount') {

			var direction = config.direction === undefined ? '<' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw new Error("Invalid relationship direction");
			}
			else {
				if(direction === '<') {
					leftDirection = direction;
				}
				else {
					rightDirection = direction;
				}
			}

			operation = "MATCH (n)@directionLeft@-[r]-@directionRight@(m) WHERE n._id='@_id@' RETURN count(DISTINCT m) AS c";

			try {
				operation = operation.replace("@directionLeft@", leftDirection)
										.replace("@directionRight@", rightDirection)
										.replace("@_id@", config.document._id);
			}
			catch (e) {
				throw e;
			}
		}
		else if (config.operation == 'getDependencies') {

			var direction = config.direction === undefined ? '<' : config.direction;
			var leftDirection = '';
			var rightDirection = '';

			if(direction !== '<' && direction !== '>' && direction !== ''){
				throw new Error("Invalid relationship direction");
			}
			else {
				if(direction === '<') {
					leftDirection = direction;
				}
				else {
					rightDirection = direction;
				}
			}

			operation = "MATCH (n)@directionLeft@-[r]-@directionRight@(m) WHERE n._id='@_id@' WITH  m, r, n OPTIONAL MATCH p=((m)<-[*]-(q)) RETURN nodes(p), m, n"

			try {
				operation = operation.replace("@directionLeft@", leftDirection)
										.replace("@directionRight@", rightDirection)
										.replace("@_id@", config.document._id);
			}
			catch (e) {
				throw e;
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
			return callback({error: 'invalidConfigError', field: 'document'});
		}

		documentInfo = isValidDocument(document);

		if (!documentInfo) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		if (document._id === '' || document._id === null || document._id === undefined) {
			return callback({error: 'invalidConfigError', field: '_id'});
		}

		this.findById(config.document._id, function (err, doc) {

			if (err) {
				return callback({error: 'mongoError', msg: err});
			}

			if (!doc) {
				return callback({error: 'notFound'});
			}

			config.operation = 'getRelationships';

			var query;
			try {
				query = queryString(config);
			} catch (err) {
				return callback({error: 'unexpectedError', msg: err});
			}

			var session = driver.session();

			session
			.run(query,{})
			.then(function(result) {
				session.close();

				var records = result.records;

				if (!records || records.length == 0) {
					let ret = {};
					ret.docs = doc._doc;
					callback(undefined, ret);
					return;
				}

				var aux = prepareResponse(records);

				var ids = aux.ids;
				var Tree = aux.tree;

				__self.find({_id: ids}, function(err, docs) {
					if (err) {
						return callback({error: 'mongoError', msg:err});
					}

					try {
						populateTreeData(Tree, docs);
					} catch (err) {
						return callback({error: 'unexpectedError', msg: err});
					}

					var innerSession = driver.session();

					config.operation = 'getRelationshipsCount';

					try {
						var newquery = queryString(config);
					} catch (err) {
						return callback({error: 'unexpectedError', msg: err});
					}

					innerSession
					.run(newquery, {})
					.then(function(r) {
						var ret = {
							docs: {},
							total: r.records[0].get('c').toInt()
						};

						ret.docs = Tree;
						return callback(null, ret);
					});
				});

			})
			.catch(function(error) {
				session.close();
				return callback(error, null);
			});
		});
	}

	function isInteger(data) {
		return (typeof data === 'number' && (data % 1)===0)
	}

	function arrayObjectIndexOf(myArray, searchTerm, property) {
		for(var i = 0, len = myArray.length; i < len; i++) {
			if (myArray[i][property] == searchTerm[property]) {
				return i;
			}
		}
		return -1;
	}

	function arrayToNested(array, object) {

		var o = object
		for(var i = 0; i < array.length-1; i++) {
				if (!o._id) {
					try {
						o._id = array[i]._id;
					}
					catch (err) {
						console.log(err);
					}
				}

				if (!o.relationships) {
					o.relationships = [];
				}

				if (array[i+1].DELETED) {
					return
				}

				if (arrayObjectIndexOf(o.relationships, array[i + 1], "_id") != -1) {
					o = o["relationships"][arrayObjectIndexOf(o.relationships, array[i+1], "_id")];
				} else {
					o.relationships.push(array[i + 1]);
					o = o.relationships[o.relationships.length -1];
				}
		}
	}

	function populateTreeData(Tree, data) {

		var objectData = {};

		objectData = data[arrayObjectIndexOf(data, Tree, "_id")];

		if (objectData) {
			Object.assign(Tree, objectData._doc);
		}

		if (Tree.relationships) {
			for (var i = 0; i < Tree.relationships.length; i++) {
				populateTreeData(Tree.relationships[i], data);
			}
		}
	}

	function normalizeProperties(data) {
		var keys = Object.keys(data);

		var obj = {};

		for (var i = 0; i < keys.length; i++) {
			if (data[keys[i]].low) {
				obj[keys[i]] = data[keys[i]].toInt();
			}
			else {
				obj[keys[i]] = data[keys[i]]
			}
		}

		return obj;
	}

	schema.statics.getDependencies = function(config, callback) {
		var __self = this;
		try {
			var document = config.document;
		}
		catch (e) {
			return callback({error: 'invalidConfigError', field: 'document'});
		}

		documentInfo = isValidDocument(document);

		if (!documentInfo) {
			return callback({error: 'invalidConfigError', field: documentInfo.field});
		}

		if (document._id === '' || document._id === null || document._id === undefined) {
			return callback({error: 'invalidConfigError', field: '_id'});
		}

		config.operation = 'getDependencies';

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
			var ids = [];

			result.records.forEach(function(cur, index, array) {
				ids.push(cur.get('n').properties._id);
				ids.push(cur.get('m').properties._id);

				if (cur._fields[0]) {
					for (var i = 1; i < cur._fields[0].length; i++) {
						ids.push(cur._fields[0][i].properties._id);
					}
				}

			});

			callback(undefined, ids);

		});
	}

	function prepareResponse(records) {

		var ids = [];
		var Tree = {};

		for (var i = 0; i < records.length; i++) {

			var subTree = [];
			subTree.push({_id: records[i]._fields[4].properties._id, DELETED: records[i]._fields[4].properties.DELETED});

			var relationship = {};
			relationship._id = records[i]._fields[2].properties._id;
			relationship.DELETED = records[i]._fields[2].properties.DELETED;
			if (records[i]._fields[3].properties) {
				relationship.relationProperties = normalizeProperties(records[i]._fields[3].properties);
			}
			subTree.push(relationship);

			if (records[i]._fields[0]) {
				var fields = records[i]._fields[0];
				for (var j = 1; j < fields.length; j++) {
					var relationship = {};
					relationship._id = fields[j].properties._id;
					relationship.DELETED = fields[j].properties.DELETED;
					if (records[i]._fields[1][j-1].properties) {
						relationship.relationProperties = normalizeProperties(records[i]._fields[1][j-1].properties);
					}
					subTree.push(relationship);
				}
			}
			arrayToNested(subTree, Tree);

			ids = ids.concat(subTree);
		}
		return {ids: ids, tree: Tree};
	}
}

/**
* Expose `neomongoosePlugin`.
*/

module.exports = neomongoosePlugin;
