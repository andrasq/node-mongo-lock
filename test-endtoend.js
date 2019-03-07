'use strict';

var mongo = require('mongodb');
var lock = require('./');

module.exports = {
    before: function(done) {
        var self = this;
        self.name = '_name' + Math.floor(Math.random() * 0x10000).toString(16);
        self.owner = '_owner' + Math.floor(Math.random() * 0x10000).toString(16);
        mongo.connect('mongodb://localhost', { w: 1 }, function(err, db) {
            self.db = db;
            self.store = db.db('test').collection('testLocks');
            self.lock = lock(self.store);
            done();
        })
    },

    beforeEach: function(done) {
        this.store.remove({ _id: /_name[0-9a-f]+/, owner: /_owner[0-9a-f]+/ }, function(err) {
            done(err);
        })
    },

    after: function(done) {
        this.db.close();
        done();
    },

    'should add a lock row': function(t) {
        var self = this;
        var now = Date.now();
        self.lock.getLock(self.name, self.owner, 0, function(err, ret) {
            console.log("AR: got", err, ret);
            self.store.findOne({ _id: self.name, owner: self.owner }, function(err, obj) {
                t.contains(obj, { _id: self.name, owner: self.owner });
                t.ok(obj.expires >= new Date(now + 20000).toISOString());
                t.done();
            })
        })
    },

    'should return error if row is locked': function(t) {
        var self = this;
        var now = Date.now();
        self.store.insert({ _id: self.name, owner: self.owner, expires: new Date(Date.now() + 100).toISOString() }, function(err) {
            t.ifError(err);
            self.lock.getLock(self.name, self.owner, 0, function(err) {
                t.ok(err);
                t.contains(err.message, 'duplicate key error');
                t.ok(Date.now() < now + 10);
                t.done();
            })
        })
    },

    'should retry for a while if row is locked': function(t) {
        var self = this;
        var now = Date.now();
        self.store.insert({ _id: self.name, owner: self.owner, expires: new Date(Date.now() + 100).toISOString() }, function(err) {
            t.ifError(err);
            self.lock.getLock(self.name, self.owner, 200, function(err) {
                t.ifError(err);
                t.ok(Date.now() >= now + 100);
                t.done();
            })
        })
        setTimeout(function() {
            self.store.remove({ _id: self.name });
        }, 100);
    },

    'should renew lock expiration': function(t) {
        var self = this;
        var now = Date.now();
        self.lock.getLock(self.name, self.owner, 0, 1000, function(err, res) {
            t.ifError(err);
            self.store.findOne({ _id: self.name }, function(err, obj) {
                t.ifError(err);
                t.ok(obj.expires >= new Date(now + 1000).toISOString());
                t.ok(obj.expires < new Date(now + 1100).toISOString());
                self.lock.renewLock(self.name, self.owner, 2000, function(err) {
                    t.ifError(err);
                    self.store.findOne({ _id: self.name }, function(err, obj) {
                        t.ifError(err);
                        t.ok(obj.expires >= new Date(now + 2000).toISOString());
                        t.ok(obj.expires < new Date(now + 2100).toISOString());
                        t.done();
                    })
                })
            })
        })
    },
}
