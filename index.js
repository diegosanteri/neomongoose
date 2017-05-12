/*!
 * Mongoose neomongo Plugin
 * Copyright(c) 2017 Diego Conti Santeri Tonini <diegosanteri@gmail.com>
 * MIT Licensed
 */
 'strict'

var neo4j = require('neo4j-driver').v1;
var jju = require('jju')

function neomongoosePlugin(schema, options) {

   var driver = neo4j.driver(options.neo4j.connectURI, neo4j.auth.basic(options.neo4j.user, options.neo4j.password));
   

   schema.statics.insertDocNode = function insertDocNode(config, callback) {
		var self = this;
		var session = driver.session();

		var document = config.document;
		var node = config.node;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		documentInfo = isValidOnlyOneNode(node);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		var modelInstance = new self(document)
		modelInstance.save(function(err, documentInserted){

			if (err || documentInserted === undefined) {
				return callback(err, undefined, undefined);
			}

			node.operation = 'insert';
			node.data._id = documentInserted.id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e, undefined, undefined); 
			}

			neo4jExec(nodeString, function(node){
					session.close();
					callback(err, documentInserted);
				}, function(err){
					session.close();
					callback(err);
				})
		})
   }

   schema.statics.updateDocNode = function updateDocNode(config, callback) {
		var self = this;
		var session = driver.session();
		
		var document = config.document;
		var node = config.node;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		documentInfo = isValidOnlyOneNode(node);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		self.update({_id: document._id}, document, function(err, response){

			if (err || response === undefined) {
				return callback(err, undefined, undefined);
			}

			if (response === null) {
				return callback({error: 'Document not found'});
			}

			node.operation = 'update';
			node.data._id = document._id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e); 
			}

			neo4jExec(nodeString, function(node){
					session.close();
					callback(err, {message: "Node has updated"});
				}, function(err){
					session.close();
					callback(err, undefined, undefined);
				})
		})
   }

   schema.statics.deleteDocNode = function deleteDocNode(config, callback) {
		var self = this;
		var session = driver.session();
		
		var document = config.document;

		var documentInfo = isValidDocument(document);
		if(!documentInfo.status) {
			return callback({error: 'Invalid config', field: documentInfo.field});
		}

		if(document._id === undefined) {
			return callback({error: 'Invalid config', field: '_id'});
		}

		self.find({_id: document._id}).remove().exec(function(err, response){

			if (err ) {
				return callback(err, undefined, undefined);
			}

			var node = {data: {}};
			node.operation = 'removeNode';
			node.data._id = document._id;

			var nodeString = ''
			try{
				nodeString = queryString(node);
			}
			catch(e) {
				return callback(e); 
			}

			neo4jExec(nodeString, function(node){
					session.close();
					callback(err, {message: "Node has deleted"});
				}, function(err){
					session.close();
					callback(err, undefined, undefined);
				})
		})
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

					neo4jExec(nodeString, function(node){
						callback(err, {"Message": "Nodes has associated with success"});
					}, function(err){
						callback(err);
					})
				}
			}
		})
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
						callback(err, {"Message": "Node has disassociate with success"});
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
						callback(err, {"Message": "Node has disassociate with success"});
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
	   									.replace('@data@', convertJsonToCypher(config.data))
	   		}
				catch(e){
					throw {error: 'Unexpected error has happened'};
				}
	   	}
	   	else if (config.operation === 'update') {
	   		try {
		   		operation = "MERGE (n:@label@ {_id: '@id@'}) SET n=@data@ RETURN n";
		   		operation = operation.replace('@label@', config.labels.nodeLabel)
		   									.replace('@id@', config.data._id)
		   									.replace('@data@', convertJsonToCypher(config.data));
				}
				catch(e){
					throw {error: 'Unexpected error has happened'};
				}

	   	}
	   	else if(config.operation === 'removeNode') {
	   		try{
	   			operation = "MATCH (p)-[r]-() WHERE p._id = '@_id@' DELETE r, p";
	   			operation = operation.replace('@_id@', config.data._id);
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

	   		try {
		   		if(config.isMultiDelete) {
		   			operation = "MATCH (p)@leftDirection@-[r:@relationName@]-@rightDirection@() WHERE p._id = '@_id@' DELETE r";
		   			operation = operation.replace('@_id@', config.data.parentNode._id)
		   										.replace('@leftDirection@', leftDirection)
		   										.replace('@rightDirection@', rightDirection)
		   										.replace('@relationName@', config.relationName);
		   		}
		   		else {
		   			console.log(config.data.parentNode)
		   			console.log(config.data.sonNode)

		   			operation = "MATCH (a:@parentLabel@ @parentNode@)@leftDirection@-[r:@relationName@]-@rightDirection@(b:@sonLabel@ @sonNode@) DELETE r";
		   			operation = operation.replace('@leftDirection@', leftDirection)
		   										.replace('@rightDirection@', rightDirection)
		   										.replace('@relationName@', config.relationName)
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
	   		
	   		
	   		operation = 'MATCH(m:@parentLabel@ @parentNode@), (n:@sonLabel@ @sonNode@) MERGE(m) @leftDirection@-[:@relationName@ @relationNode@]-@rightDirection@ (n) RETURN m,n';
	   		

	   		try{
	   			operation = operation.replace('@relationName@', config.relationName)
	   										.replace('@relationNode@', relationNode)
												.replace('@leftDirection@', leftDirection)
												.replace('@rightDirection@', rightDirection)
												.replace('@parentLabel@', config.labels.parentLabel)
												.replace('@sonLabel@', config.labels.sonLabel)
												.replace('@parentNode@', convertJsonToCypher(config.data.parentNode))
												.replace('@sonNode@', convertJsonToCypher(config.data.sonNode));
												
				}
				catch(e){
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
   	var status = (document !== undefined  && document !== null) ? true : false;
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

   	if(node.data.sonNode === undefined || node.data.sonNode === null) {
   		return {status: false, field: 'sonNode'};
   	}

   	if(node.labels.parentLabel === undefined || node.labels.parentLabel === null || node.labels.parentLabel === '') {
   		return {status: false, field: 'parentLabel'};
   	}

   	if(node.isMultiDelete === undefined || node.isMultiDelete === undefined) {
   		if(node.labels.sonLabel === undefined || node.labels.sonLabel === null || node.labels.sonLabel === '') {
   			return {status: false, field: 'sonLabel'};
   		}
   	}
   	

   	return {status: true};
   }
}

/**
 * Expose `neomongoosePlugin`.
 */

module.exports = neomongoosePlugin;