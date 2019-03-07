/**
 * mongo-lock -- mongodb advisory locks like mysql get_lock()
 *
 * 2019-03-06 - AR.
 */

'use strict';

module.exports = MongoLock;


function MongoLock( db ) {
    this.db = db;
    this.lockTimeout = 20000;
    if (!this.db) throw new Error('missing db');
    var dbMethods = ['insert', 'remove', 'update', 'findOne'];
    for (var i=0; i<dbMethods.length; i++) {
        if (typeof db[dbMethods[i]] !== 'function') throw new TypeError('db must have methods insert, remove, update, findOne');
    }
}

MongoLock.prototype.getLock = function getLock( name, owner, waitTime, lockTimeout, callback ) {
    if (!callback) {
        callback = lockTimeout;
        lockTimeout = this.lockTimeout;
    }
    if (typeof name !== 'string' || typeof owner !== 'string') throw new TypeError('name and owner must be strings');
    if (typeof callback !== 'function') throw new Error('callback required');

    var self = this;
    var retryUntil = Date.now() + (waitTime > 0 ? waitTime : -1);
    tryToLock(1);

    function tryToLock(attemptCount) {
        var now = Date.now();
        var expires = now + lockTimeout;
        // note: could also be done with an upsert, but the insert is more bulletproof
        self.db.insert({ _id: String(name), owner: String(owner), expires: self._getTimestamp(expires) }, { w: 1 }, function(err) {
            if (err && (err.code == 11000 || err.message.indexOf('duplicate key error') >= 0)) {
                if (attemptCount === 1) self._expireLock(name, function(err) { setImmediate(tryToLock) });
                else if (now <= retryUntil) setTimeout(tryToLock, 5);
                else callback(err);
            }
            else callback(err);
        })
    }
}

MongoLock.prototype.releaseLock = function releaseLock( name, owner, callback ) {
    this.db.remove({ _id: name, owner: owner }, { w: 1 }, callback);
}

MongoLock.prototype.renewLock = function renewLock( name, owner, lockTimeout, callback ) {
    var expires = Date.now() + lockTimeout;
    // FIXME: return feedback of whether the renew was successful
    if (expires > 0) this.db.update({ _id: String(name), owner: String(owner) }, { $set: { expires: this._getTimestamp(expires) } }, { w: 1, upsert: true }, callback);
}

MongoLock.prototype.isFreeLock = function isFreeLock( name, callback ) {
    this.isUsedLock(name, function(err, owner) {
        return err ? callback(err) : callback(null, owner === null);
    })
}

MongoLock.prototype.isUsedLock = function isUsedLock( name, callback ) {
    this.db.findOne({ _id: name }, function(err, doc) {
        return err ? callback(err) : callback(null, doc && doc[0] && doc[0].owner);
    })
}


MongoLock.prototype._expireLock = function _expireLock( name, callback ) {
    this.db.remove({ _id: String(name), expires: { $lt: this._getTimestamp() } }, { w: 1 }, callback);
}

MongoLock.prototype._getTimestamp = function _getTimestamp( now ) {
    return new Date(now || Date.now()).toISOString();
}
