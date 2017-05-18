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

describe('Create', function() {


	describe('Valid Document', function () {
	
		var docnode = new docNode();
		docnode.document = products[0];

		it('Should Create', function(done){

			return productModel.insertDocNode(docnode, function(err, doc) {
				if (err) {
					console.log(err);
					done();
				}
				expect(doc._id).to.exist;
				docnode.document = doc;
				done();
			});
		});

		after(function(done) {
			productModel.deleteDocNode(docnode, function() {
				done();
			});
		});
	});

	describe('Invalid Document', function () {
		
		it('Empty Document - Should Return Error', function(done){
			productModel.insertDocNode(new docNode(), function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Undefined Document - Should Return Error', function(done){
			var docnode = new docNode();
			delete docnode.document;
			productModel.insertDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Document With Defined _id - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document._id = '1';
			productModel.insertDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: '_id'});
				done();
			});
		});
	});
});

describe('Update', function() {

	describe('Valid Update', function () {
		var docnode = new docNode();
		docnode.document = products[1];

		before(function(done) {
			return productModel.insertDocNode(docnode, function(err, doc) {
				docnode.document = doc;
				done();
			});
		});


		it('Should Update', function (done){
			docnode.document.code = '20';

			return productModel.updateDocNode(docnode, function(err, doc) {
				if (err) {
					expect(false).to.true;
					done();
				}

				productModel.findById(docnode.document._id, function(err, doc) {
					if (err) {
						expect(false).to.true;
						done();
					}
					expect(doc.code).to.equal('20');
					done();
				});
			});
		});


		after(function(done) {
			productModel.deleteDocNode(docnode, function(){
				done();
			});
		});
	});

	describe('Invalid Update', function(){
		it('Empty Document - Should Return Error', function(done) {
			productModel.updateDocNode(new docNode(), function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Undefined Document - Should Return Error', function(done) {
			var docnode = new docNode();
			delete docnode.document;
			productModel.updateDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Undefined document _id - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document.name = '1';
			productModel.updateDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: '_id'});
				done();
			});
		});

		it('Invalid document _id - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document._id = '1';
			productModel.updateDocNode(docnode, function(err, doc) {
				expect(err.name).to.equal('CastError');
				done();
			});
		})

		it('Document nonexistent - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document._id = '111111111111';
			productModel.updateDocNode(docnode, function(err, doc) {
				expect(err).to.exist;
				done();
			});
		});
	});
});

describe('Delete Product', function() {


	describe('Valid Delete', function() {
		var docnode = new docNode();
		docnode.document = products[2];

		before(function(done) {
			return productModel.insertDocNode(docnode, function(err, doc) {
				docnode.document = doc;
				done();
			});
		});

		it('Should Delete', function(done) {
			return productModel.deleteDocNode(docnode, function(){

				productModel.findById(docnode.document._id, function(err, doc) {
					expect(doc).to.not.exist;
					done();
				});
			});
		});
	});

	describe('Invalid Delete', function() {

		it('Empty Document - Should Return Error', function(done) {
			productModel.deleteDocNode(new docNode(), function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Undefined Document - Should Return Error', function(done) {
			var docnode = new docNode();
			delete docnode.document;
			productModel.deleteDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: 'document'});
				done();
			});
		});

		it('Undefined document _id - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document.name = '1';
			productModel.deleteDocNode(docnode, function(err, doc) {
				expect(err).to.eql({error: 'Invalid config', field: '_id'});
				done();
			});
		});

		it('Invalid document _id - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document._id = '1';
			productModel.deleteDocNode(docnode, function(err, doc) {
				expect(err.name).to.equal('CastError');
				done();
			});
		})

		it('Document nonexistent - Should Return Error', function(done) {
			var docnode = new docNode();
			docnode.document._id = '111111111111';
			productModel.deleteDocNode(docnode, function(e, doc) {
				expect(e).to.eql({error: 'Not Found'});
				done();
			});
		});
	});
});

describe('Create Relationship', function() {

	var docnode = [];
	docnode[0] = new docNode();
	docnode[1] = new docNode();

	docnode[0].document = {code: 1};
	docnode[1].document = {code: 2};

	before(function(done) {
		productModel.insertDocNode(docnode[0], function(err, doc) {
			docnode[0] = doc;
			productModel.insertDocNode(docnode[1], function(err,doc) {
				docnode[1] = doc;
				done();
			});
		});
	});

	describe('Valid Relationship', function() {

		it('Should Create Relationship', function(done) {
			var doc = new docNode();
			doc.node.data.parentNode = docnode[0];
			doc.node.data.sonNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';

			productModel.associateNodes(doc, function(err, obj) {
				expect(obj).to.eql({Message: 'Nodes has associated with success'});
				done();
			});
		});
	});

	describe('Invalid Relationship', function() {
		it('Missing Relation Name - Should Return Error', function(done) {
			var doc = new docNode();

			doc.node.data.parentNode = docnode[0];
			doc.node.data.sonNode = docnode[1];

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'relationName' });
				done();
			});
		});


		it('Missing Parent Label - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.parentNode = docnode[0];
			doc.node.data.sonNode = docnode[1];
			doc.node.relationName = 'Testing'

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'parentLabel' });
				done();
			});
		});

		it('Missing Son Label - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.parentNode = docnode[0];
			doc.node.data.sonNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'sonLabel' });
				done();
			});
		});


		it('Missing Parent Node - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.sonNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'parentNode' });
				done();
			});
		});

		it('Missing Son Node - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.parentNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'sonNode' });
				done();
			});
		});

		it('Missing Parent _id - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.parentNode = {code: 'teste'};
			doc.node.data.sonNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';

			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'parentNode' });
				done();
			});
		});

		it('Missing Son _id - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.sonNode = {code: 'teste'};
			doc.node.data.parentNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';
			
			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: 'Invalid config', field: 'sonNode' });
				done();
			});
		});

		it('NonExistent Parent _id - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.sonNode = {_id: '111111111111'};
			doc.node.data.parentNode = docnode[1];
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';
			
			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: "Nodes doesn't exist" });
				done();
			});
		});

		it('NonExistent Son _id - Should Return Error', function(done) {
			var doc = new docNode();
			doc.node.data.sonNode = docnode[0];
			doc.node.data.parentNode = {_id: '111111111111'};
			doc.node.relationName = 'Testing';
			doc.node.labels.parentLabel = 'Product';
			doc.node.labels.sonLabel = 'Product';
			
			productModel.associateNodes(doc, function(err, obj) {
				expect(err).to.eql({ error: "Nodes doesn't exist" });
				done();
			});
		});
	});

	after(function(done) {
		var docs = [new docNode(), new docNode()];

		docs[0].document = docnode[0];
		docs[1].document = docnode[1];


		productModel.deleteDocNode(docs[0], function(err, doc) {
			productModel.deleteDocNode(docs[1], function(err, doc) {
				done();
			})
		});
	});
});

/*
describe('Delete Single Relationship', function() {

	var docnode = [];
	var docs = [];
	docnode[0] = new docNode();
	docnode[1] = new docNode();

	docnode[0].document = {code: 1};
	docnode[1].document = {code: 2};

	before(function(done) {
		productModel.insertDocNode(docnode[0], function(err, doc) {
			docs[0] = doc;
			productModel.insertDocNode(docnode[1], function(err,doc) {
				docs[1] = doc;


				docnode[0].node.data.parentNode = docs[0];
				docnode[0].node.data.sonNode = docs[1];
				docnode[0].node.relationName = 'Testing';
				docnode[0].node.labels.parentLabel = 'Product';
				docnode[0].node.labels.sonLabel = 'Product';

				productModel.associateNodes(docnode[0], function(err, obj) {
					done();
				});
			});
		});
	});

	describe('Valid Delete', function() {

		it('Should Delete Relationship');
	});
});
*/

describe('Getting Relationships', function() {

	var docnode = new docNode();
	var docs = [];

	before(function(done) {
		docnode.document = products[0];

		productModel.insertDocNode(docnode, function(err, obj) {
			
			docs.push(obj);
			docnode.document = products[1];

			productModel.insertDocNode(docnode, function(err, obj) {
				
				docs.push(obj);
				docnode.document = products[2];

				productModel.insertDocNode(docnode, function(err, obj) {
					
					docs.push(obj);
					docnode.node.data.parentNode = docs[0];
					docnode.node.data.sonNode = docs[1];
					docnode.node.direction = '<';
					docnode.node.relationName = 'Testando';
					docnode.node.labels.parentLabel = 'Product';
					docnode.node.labels.sonLabel = 'Product';

					productModel.associateNodes(docnode, function(err,obj) {
						docnode.node.data.parentNode = docs[1];
						docnode.node.data.sonNode = docs[2];

						productModel.associateNodes(docnode, function(err, obj) {
							done();
						});
					});
				});
			});
		});
	});


	it('Teste', function(done) {

		var relationshipConfig = {
			direction: '<',
			depth: 0,
			page: 0,
			recordsPerPage: 2,
			document: {}
		}

		relationshipConfig.document = docs[0];

		productModel.getRelationships(relationshipConfig, function(err, tree) {

			expect(tree.code).to.equal('1');
			expect(tree.relationships[0].code).to.equal('2');
			expect(tree.relationships[0].relationships[0].code).to.equal('3')
			done();
		});

	});

});