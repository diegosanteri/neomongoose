var config = {
	neo4j: {
		connectURI: "bolt://localhost",
		user: "neo4j",
		password: "omfgxd512"
	},
	mongo: 'mongodb://localhost/testDB'
};

function DocNode() {
	this.node= {
		data:{
			nodeData: {},
			parentNode: {}, 
			sonNode: {},
			relationNode: {}
		}, 
		isMultiDelete: false, 
		direction: '<', 
		relationName: 'TESTING',
		labels:{
			nodeLabel:'Product', 
			parentLabel:'Product', 
			sonLabel:'Product' 
		}
	},
	this.document= {}
};

module.exports = {
	Config : config,
	DocNode : DocNode
}