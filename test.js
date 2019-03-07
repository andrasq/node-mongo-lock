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

    'should be both a constructor and a factory': function(t) {
        var lock1 = new MongoLock(getMockDb());
        var lock2 = MongoLock(getMockDb());
        t.ok(lock1 instanceof MongoLock);
        t.ok(lock2 instanceof MongoLock);
        t.done();
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
            var now = Date.now();
            var spy = t.spy(this.db, 'insert');
            t.equal(this.lock.lockTimeout, 20000);
            this.lock.getLock('someName', 'someOwner', 0, function(err) {
                t.ok(spy.called);
                t.ok(spy.args[0][0].expires >= new Date(now + 20000).toISOString());
                // TODO: every now and then the below line fails:
                t.ok(spy.args[0][0].expires < new Date(now + 20100).toISOString());
                t.done();
            })
        },

        'should use provided lockTimeout': function(t) {
            var now = Date.now();
            var spy = t.spy(this.db, 'insert');
            this.lock.getLock('someName', 'someOwner', 0, 30000, function(err) {
                t.ok(spy.called);
                t.ok(spy.args[0][0].expires >= new Date(now + 30000).toISOString());
                t.ok(spy.args[0][0].expires < new Date(now + 30100).toISOString());
                t.done();
            })
        },

        'should return database error': function(t) {
            t.stubOnce(this.db, 'insert').yields('mock db error');
            this.lock.getLock('someName', 'someOwner', 0, 20000, function(err) {
                t.equal(err, 'mock db error');
                t.done();
            })
        },

        'if locked': {
            'should try to expire lock': function(t) {
                var error = { code: 11000, message: 'duplicate key error' };
                t.stub(this.db, 'insert').yields(error);
                var spy = t.stubOnce(this.lock, '_expireLock').yields();
                this.lock.getLock('someString', 'someOwner', 0, function(err) {
                    t.equal(err, error);
                    t.ok(spy.called);
                    t.done();
                })
            },

            'should retry after expire even with no waitTime': function(t) {
                var now = Date.now();
                var spy = t.stub(this.db, 'insert').yieldsOnce({ message: 'duplicate key error' }).yields();
                this.lock.getLock('someString', 'someOwner', 0, function(err) {
                    t.ifError(err);
                    t.equal(spy.callCount, 2);
                    t.done();
                })
            },

            'should retry until waitTime timeout': function(t) {
                var now = Date.now();
                var error = { code: 11000, message: 'duplicate key error' };
                t.stub(this.db, 'insert').yields(error);
                this.lock.getLock('someString', 'someOwner', 100, function(err) {
                    t.equal(err, error);
                    t.ok(Date.now() >= now + 100);
                    t.done();
                })
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

    'renewLock': {
        'should require lockTimeout and callback': function(t) {
            var lock = this.lock;
            t.throws(function() { lock.renewLock('someName', 'someOwner', function() {}) }, /lockTimeout/);
            t.throws(function() { lock.renewLock('someName', 'someOwner', "foo") }, /lockTimeout/);
            t.throws(function() { lock.renewLock('someName', 'someOwner', 7) }, /callback/);
            t.done();
        },

        'should call db.update with the new expires': function(t) {
            var self = this;
            var spy = t.spyOnce(self.db, 'update');
            var now = Date.now();
            this.lock.renewLock('someName', 'someOwner', 10000, function(err) {
                t.ok(spy.called);
                t.equal(spy.args[0][0]._id, 'someName');
                t.equal(spy.args[0][0].owner, 'someOwner');
                t.ok(spy.args[0][1].$set.expires >= new Date(now + 10000).toISOString());
                t.ok(spy.args[0][1].$set.expires < new Date(now + 10100).toISOString());
                t.equal(spy.args[0][2].upsert, true);
                t.done();
            })
        },

        'should return confirmation that lock was renewed': function(t) {
            t.skip();
        },
    },

    'isFreeLock': {
        'should call isUsedLock': function(t) {
            var lock = this.lock;
            var spy = t.stubOnce(lock, 'isUsedLock').yields(null, 'user123');
            lock.isFreeLock(this.name, function(err, ret) {
                t.ok(spy.called);
                t.strictEqual(ret, false);
                t.done();
            })
        },

        'returns isUsedLock errors': function(t) {
            var spy = t.stubOnce(this.lock, 'isUsedLock').yields('mock isUsedLock error');
            this.lock.isFreeLock(this.name, function(err, ret) {
                t.ok(spy.called);
                t.equal(err, 'mock isUsedLock error');
                t.done();
            })
        },
    },

    'isUsedLock': {
        'should call findOne': function(t) {
            var spy = t.spyOnce(this.db, 'findOne');
            this.lock.isUsedLock(this.name, function(err, ret) {
                t.ok(spy.called);
                t.done();
            })
        },

        'returns mongo errors': function(t) {
            var spy = t.stubOnce(this.db, 'findOne').yields('mock mongo error');
            this.lock.isUsedLock(this.name, function(err, ret) {
                t.ok(spy.called);
                t.equal(err, 'mock mongo error');
                t.done();
            })
        },

        'returns the lock owner': function(t) {
            var spy = t.stubOnce(this.db, 'findOne').yields(null, { _id: 'someName', owner: 'someOwner', expires: new Date().toISOString() });
            this.lock.isUsedLock(this.name, function(err, ret) {
                t.ifError(err);
                t.equal(ret, 'someOwner');
                t.done();
            })
        },
    },
}

function getMockDb( ) {
    return {
        insert: function(entity, opts, cb) { cb() },
        remove: function(query, opts, cb) { cb() },
        findOne: function(query, cb) { cb() },
        update: function(query, entity, opts, cb) { cb() },
    }
}
