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
		direction: '', 
		relationName: '',
		labels:{
			nodeLabel:'Product', 
			parentLabel:'', 
			sonLabel:'' 
		}
	},
	this.document= {}
};

module.exports = {
	Config : config,
	DocNode : DocNode
}