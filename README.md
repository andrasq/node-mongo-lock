mongo-lock
==========
[![Build Status](https://api.travis-ci.org/andrasq/node-mongo-lock.svg?branch=master)](https://travis-ci.org/andrasq/node-mongo-lock?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-mongo-lock/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-mongo-lock?branch=master)


MongoDB advisory string locks patterned after MySQL `GET_LOCK()` et al.


## API

### locks = new MongoLock( db )

Create a mongodb advisory lock gateway.  The locks will be set using the database gateway
provided to the constructor; it can be a mongodb collection object.

The database gateway `db` must have methods
- insert( entity, options, cb )
- findOne( query, cb )
- update( query, entity, options, cb )
- remove( query, options, cb )

### getLock( name, owner, waitTimeMs, [lockTimeoutMs,] callback(err) )

Set a mutex for `name` owned by `owner`.  `name` and `owner` must be strings.  If the mutex
is already set, retry for up to `waitTimeMs` milliseconds.  If the lock cannot be acquired,
returns an error to the callback.  Once a mutex is set, it must be cleared or renewed by the
same owner.  Unless renewed, a mutex will time out after lockTimeoutMs milliseconds (default
20 seconds).

### releaseLock( name, owner )

Clear the mutex for the string `name`.  The `owner` must be the same that set the mutex.

### renewLock( name, owner, lockTimeoutMs, callback(err) )

Renew the expiration time of the mutex for the string `name`.  The lock will be set to
expire `lockTimeoutMs` milliseconds from now.  The `owner` must be the same that set the
mutex.

### isUsedLock( name, callback(err, owner) )

Return the owner of the named lock, else falsy (null).  Owners are identified by strings.

### isFreeLock( name, callback(err, yesNo) )

Return true if the lock is free (mutex not set), false if it not.
