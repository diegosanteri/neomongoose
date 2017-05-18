'use strict';

var config = require('./config').Config;
var mongoose = require('mongoose');

mongoose.Promise = global.Promise;

mongoose.connect(config.mongo);
var db = mongoose.connection;

db.on('error', function() {
	console.log('Error connecting to MongoDB')
});
db.once('open', function() {
	require('./test_performance');
});