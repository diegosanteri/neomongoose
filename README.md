# neomongoose

## What's Neomongoose?

Mongoose plugin that working with mongoose and neo4j together

## Install

```sh
# install Neomongoose
npm install --save neomongoose

```

## Options

Connect to neo4j database

- `--connectURI` - Connection URL.
- `--user` - Database user.
- `--password` - Database password.

Options operations
```sh
{
  node: {
    data:{
      nodeData: {},// for only one node,
      parentNode: {}, //
      sonNode: {},//
      relationNode: {}//optional
    }, 
    isMultiDelete: false, // default is false  
    direction: '', // default is '', This options has thre options: '', '<' and '>'
    relationName: '',// optional
    labels:{
      nodeLabel:'', // for only one node,
      parentLabel:'', //
      sonLabel:'' //
    }
  }
}
```

## Usage

Add plugin in mongoose

```sh
var mongoose = require('mongoose'),
Schema = mongoose.Schema
neomongoosePlugin = require('../module/neomongoose');

var UserSchema = new Schema({
  username: {type:String, required: true},
  name: {type:String, required: true}
});

UserSchema.plugin(neomongoosePlugin, {connectURI: 'bolt://localhost', user: 'neo4j', password:'q1w2e3www'})

var user = mongoose.model('user', UserSchema);

module.exports = {
  User : user
};
```

Insert data
```sh
var userModel = require('./model/user').User;

var document = req.body;
var node = {data:{nodeData: {username: req.body.username}}, labels:{nodeLabel: 'user'} }

userModel.insertDocNode({document: document, node:node}, function(err, document, node){
			
  if(err) {
    res.status(500)
    res.json(err)
    return;
  }

  res.json(document)

})
```

Update data
```sh
var userModel = require('./model/user').User;

var document = req.body;
var node = {data:{nodeData: {username: req.body.username}}, labels:{nodeLabel: 'user'} }

userModel.updateDocNode({document: document, node:node}, function(err, document, node){
			
  if(err) {
    res.status(500)
    res.json(err)
    return;
  }

  res.json(document)

})
```

Delete data
```sh
var userModel = require('./model/user').User;

req.body._id = req.params.id;
userModel.deleteDocNode({document: req.body}, function(err, document, node){

  if(err) {
    res.status(500)
    res.json(err)
    return;
  }

  res.json(document)

})
```

Associate Node
```sh
var parent = {};
parent._id = "5915bd15671309301664fc25";

var son = {};
son._id = "5915d2e284fb254134e23fcd"

var relation = {};
relation.since = 1992;

var data = {parentNode: parent, sonNode: son, relationNode: relation}
var labels = {parentLabel: 'user', sonLabel: 'user'};

userModel.associateNodes({node:{ data: data, relationName: 'belongsto',	labels: labels}}, function(err, response){
  if(err) {
    res.status(500)
    res.json(err)
    return;
  }
  res.json(response)
});
```

Disassociate Node (only one)
```sh
var parent = {};
parent._id = "5915d2e284fb254134e23fcd";

var son = {};
son._id = "5915bd15671309301664fc25";

userModel.disassociate({
    node:{ 
      labels:{parentLabel: 'user', sonLabel: 'user'},
      data: {parentNode: parent, sonNode: son}, 
      isMultiDelete: false, 
      relationName: 'belongsto'
    }
  }, function(err, response){
  if(err) {
    res.status(500)
    res.json(err)
    return;
  }
  res.json(response)
})
```

Disassociate Node (All nodes)
```sh
var parent = {};
parent._id = "5915d2e284fb254134e23fcd";

userModel.disassociate({node:{ data: {parentNode: parent}, isMultiDelete: true}}, function(err, response){
  if(err) {
    res.status(500)
    res.json(err)
    return;
  }
  res.json(response)
})
```
