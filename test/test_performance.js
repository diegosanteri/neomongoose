'use strict';

var assert = require('assert');
var expect = require('chai').expect;
var config = require('./config').Config;
var docNode = require('./config').DocNode;
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var neomongoose = require('../index');
var products = require('./models').Products;

var productSchema = new Schema({
	code: {type: String}
});

productSchema.plugin(neomongoose, config.neo4j);

var productModel = mongoose.model('Products', productSchema);

var i = 0;
var j = 0;
var docs = [];

function testCreate(done, numRecords) {

	var docnode = new docNode();
	docnode.document = {code: i};
	productModel.insertDocNode(docnode, function(err, doc) {
		docs.push(doc);
		if (i < numRecords) {
			i++;
			testCreate(done, numRecords);
		}
		else {
			done(numRecords +' saves');
		}
	});
}

function doneCreate(label) {
	console.timeEnd(label);

	console.time(numAssociations + ' associations');
	testAssociate(doneAssociate, numAssociations);
}

function testAssociate(done, depth) {
	var docnode = new docNode();

	docnode.node.data.parentNode = docs[j];
	docnode.node.data.sonNode = docs[j+1];
	docnode.node.data.relationNode.quantity = j;

	productModel.associateNodes(docnode, function(err, doc) {
		if (j < depth) {
			j++;
			testAssociate(done, depth);
		}
		else {
			done(depth +' associations');
		}
	});
}

function doneAssociate(label) {
	console.timeEnd(label);

	var searchConfig = {
		depth: 0,
		direction: '<',
		recordsPerPage: 2,
		page: 0,
		document : {}
	};

	searchConfig.document = docs[0];

	console.log(docs[0]._id);

	console.time('fetch tree');
	productModel.getRelationships(searchConfig, function(err, Tree) {
		if(err) {
			console.log(err);
		}
		console.timeEnd('fetch tree');
		console.log(JSON.stringify(Tree));
	});
}

var numCreates = 10;
var numAssociations = 4;
console.time(numCreates + ' saves');
testCreate(doneCreate, numCreates);