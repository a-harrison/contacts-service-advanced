var carbon = require('carbon-io')
var HttpErrors = carbon.HttpErrors
var o      = carbon.atom.o(module)
var _o     = carbon.bond._o(module)
var _      = require('lodash')

/***************************************************************************************************
 * ContactsEndpoint
 *
 * This is the /users/:user/contacts Endpoint. It is a Collection.
 *
 */
module.exports = o({

  /*****************************************************************************
   * _type
   */
  _type: carbon.carbond.collections.Collection,

  /*****************************************************************************
   * enabled
   */
  enabled: {
    insert: false,
    find: true,
    save: false,
    update: false,       // We do not support bulk updates to this collection
    remove: false,       // We do not support bulk removes to this collection
    insertObject: true,
    saveObject: true,
    findObject: true,
    updateObject: false, // We do not allow for updates, only saving back the whole object.
    removeObject: true,
  },

  /*****************************************************************************
   * collection
   *
   * The name of the MongoDB collection storing Contacts.
   */
  collection: 'contacts',

  /*****************************************************************************
   * schema
   *
   * Schema for the API interface to Contacts. Notice this is not the same as the db schema and does not include
   * the user field.
   */
  schema: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phoneNumbers: {
        type: 'object',
        properties: {
          home: { type: 'string' },
          work: { type: 'string' },
          mobile: { type: 'string' }
        },
      },
    },
    required: [ '_id', 'firstName' ],
    additionalProperties: false
  },

  /*****************************************************************************
   * acl
   *
   * Acl for this Collection endpoint. Note that the parent Endpoint of this Endpoint, the UsersEndpoint,
   * defines an acl that also governs this Endpoint which ensures the authenticated user is the same as the userId
   * in the path.
   */
  acl: o({
    _type: carbon.carbond.security.CollectionAcl,

    entries: [
      {
        // All Users
        user: '*',
        permissions: {
          find: true,
          insertObject: true,
          findObject: true,
          saveObject: true,
          removeObject: true,
          '*': false // Not strictly needed as the default for permissions is false.
        }
      }
    ]

  }),

  /*****************************************************************************
   * idGenerator
   */
  idGenerator: o({
    _type: carbon.carbond.ObjectIdGenerator,
    generateStrings: true
  }),

  /*****************************************************************************
   * insertObjectConfig
   */
  insertObjectConfig: {
    returnsInsertedObject: true
  },

  /*****************************************************************************
   * insertObject
   */
  insertObject: function(obj, context) {
    obj.user = context.user // Set the contacts user field to the authenticated user id
    var result = this.getCollection().insertObject(obj)
    return this._publicView(result)
  },

  /*****************************************************************************
   * findConfig
   */
  findConfig: {
    supportsPagination: false,
    additionalParameters: {
      query: {
        description: 'Query spec (JSON)',
        location: 'query',
        schema: {
          type: 'string' // Allows for ?query=<string> which will search for a match in firstName, lastName, and email.
        }
      }
    }
  },

  /*****************************************************************************
   * find
   *
   * Supports an optional query. Returns the entire set of matching contacts as an array. No pagination is used,
   * as this dataset should be relatively small.
   */
  find: function(context) {
    var self = this
    var userId = context.user

    var result = []
    if (context.query) {

      result = this.getCollection().find({ $or: [{ firstName: context.query }, // We could get fancier and use regex searches
                                                 { lastName: context.query },
                                                 { email: context.query }],
                                           user: userId }).sort({ firstName: 1 }).toArray()
    } else {
      result = this.getCollection().find({ user: userId }).sort({ firstName: 1 }).toArray()
    }

    result = _.map(result, function(contact) {
      return self._publicView(contact)
    })

    return result
  },

  saveObjectConfig: {
    supportsInsert: false
  },

  /*****************************************************************************
   * saveObject
   */
  saveObject: function(obj, context) {
    // Security Note: This is secured by virtue of the CollectionAcl defined
    // on our parent Collection endpoint which ensures this id is the same as the
    // authenticated User's _id.

    // Make sure this points to right user by setting the user field to the authenticated user.
    obj.user = context.user

    // Be careful not to call save() or saveObject() on the database collection here. Those methods allow
    // for upsert which we do not want since we do not want clients to be able to create new contacts this
    // way. We want to be in control of the _id values.
    try {
      this.getCollection().updateObject(obj._id, obj)
      return this._publicView(obj)
    } catch (e) {
      throw new HttpErrors.NotFound(obj._id)
    }
  },

  /*****************************************************************************
   * findObject
   */
  findObject: function(id) {
    // Security Note: This is secured by virtue of the CollectionAcl defined
    // on our parent Collection endpoint which ensures this id is the same as the
    // authenticated User's _id or the User.
    var result = this.getCollection().findOne({ _id: id })
    return this._publicView(result)
  },

  /*****************************************************************************
   * removeObject
   */
  removeObject: function(id) {
    // Security Note: This is secured by virtue of the CollectionAcl defined
    // on our parent Collection endpoint which ensures this id is the same as the
    // authenticated User's _id.
    try {
      this.getCollection().removeObject(id)
      return 1
    } catch (e) {
      throw new HttpErrors.NotFound(id)
    }
  },

  /*****************************************************************************
   * getCollection
   */
  getCollection: function() {
    return this.service.db.getCollection(this.collection)
  },

  /*****************************************************************************
   * _publicView
   */
  _publicView: function(obj) {
    var result = {
      _id: obj._id,
      phoneNumbers: obj.phoneNumbers || {}
    }

    if (obj.firstName) {
      result.firstName = obj.firstName
    }

    if (obj.lastName) {
      result.lastName = obj.lastName
    }

    if (obj.email) {
      result.email = obj.email
    }

    return result
  }

})
