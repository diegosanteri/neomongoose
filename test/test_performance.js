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

var productModel = mongoose.model('Product', productSchema);

var i = 0;
var docs = [];

function testCreate(done, numRecords) {

	var docnode = new docNode();
	docnode.document = {code: i};
	productModel.insertDocNode(docnode, function(err, doc) {
		docs.push(doc);
		if (i < numRecords) {
			i++;
			testCreate(done);
		}
		else {
			done();
		}
	});
}

function done() {
	console.timeEnd('1000 saves');
}

console.time('1000 saves');
testCreate(done);