'use strict';

var MongoLock = require('./');

module.exports = {
    setUp: function(done) {
        this.name = 'name' + (Math.random() * 0x10000).toString(16);
        this.owner = 'owner' + (Math.random() * 0x10000).toString(16);
        this.db = getMockDb();
        this.lock = new MongoLock(this.db);
        done();
    },

    'should export expected methods': function(t) {
        var lock = new MongoLock(getMockDb());
        var expected = ['getLock', 'releaseLock', 'renewLock', 'isFreeLock', 'isUsedLock'];
        for (var i=0; i<expected.length; i++) {
            t.equal(typeof lock[expected[i]], 'function');
        }
        t.done();
    },

    'should require db': function(t) {
        t.throws(function() { new MongoLock() }, /missing db/);
        var dbMethods = ['insert', 'remove', 'update', 'findOne'];
        for (var i=0; i<dbMethods.length; i++) {
            var db = getMockDb();
            delete db[dbMethods[i]];
            t.throws(function() { new MongoLock(db) }, /must have method/);
        }
        t.done();
    },

    'getLock': {
        'should require string name, owner, function callback': function(t) {
            var lock = this.lock;
            t.throws(function() { lock.getLock() }, /name and owner/);
            t.throws(function() { lock.getLock(1, 2) }, /must be strings/);
            t.throws(function() { lock.getLock("foo", 2) }, /must be strings/);
            t.throws(function() { lock.getLock("foo", "bar") }, /callback/);
            t.throws(function() { lock.getLock("foo", "bar", "callback") }, /callback/);
            t.skip();
        },

        'should call db.insert with name, owner and expires': function(t) {
            var spy = t.spyOnce(this.db, 'insert');
            var self = this;
            this.lock.getLock(self.name, self.owner, 0, function(err) {
                t.ok(spy.called);
                t.contains(spy.args[0][0], { _id: self.name, owner: self.owner });
                t.ok(spy.args[0][0].expires > new Date().toISOString());
                t.ok(spy.args[0][0].expires <= new Date(Date.now() + self.lock.lockTimeout).toISOString());
                t.done();
            })
        },

        'should use default lockTimeout': function(t) {
            t.skip();
        },

        'should use provided lockTimeout': function(t) {
            t.skip();
        },

        'should return database error': function(t) {
            t.skip();
        },

        'if locked': {
            'should try to expire lock': function(t) {
                t.skip();
            },

            'should retry after expire even no waitTime': function(t) {
                t.skip();
            },

            'should retry until waitTime timeout': function(t) {
                t.skip();
            },
        },
    },

    'releaseLock': {
        'should call db.remove': function(t) {
            var spy = t.spyOnce(this.db, 'remove');
            var self = this;
            this.lock.releaseLock(self.name, self.owner, function(err) {
                t.ok(spy.called);
                t.contains(spy.args[0][0], { _id: self.name, owner: self.owner });
                t.done();
            })
        },

        'should return db errors': function(t) {
            t.stubOnce(this.db, 'remove').yields('mock remove error');
            this.lock.releaseLock(this.name, this.owner, function(err) {
                t.equal(err, 'mock remove error');
                t.done();
            })
        },
    },
}

function getMockDb( ) {
    return {
        insert: function(entity, opts, cb) { cb() },
        remove: function(query, opts, cb) { cb() },
        findOne: function(query, opts, cb) { cb() },
        update: function(query, entity, opts, cb) { cb() },
    }
}
