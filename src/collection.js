;(function (root) {
  root.Parse = root.Parse || {}
  var Parse = root.Parse
  var _ = Parse._

  /**
   * Creates a new instance with the given models and options.  Typically, you
   * will not call this method directly, but will instead make a subclass using
   * <code>Parse.Collection.extend</code>.
   *
   * @param {Array} models An array of instances of <code>Parse.Object</code>.
   *
   * @param {Object} options An optional object with Backbone-style options.
   * Valid options are:<ul>
   *   <li>model: The Parse.Object subclass that this collection contains.
   *   <li>query: An instance of Parse.Query to use when fetching items.
   *   <li>comparator: A string property name or function to sort by.
   * </ul>
   *
   * @see Parse.Collection.extend
   *
   * @class
   *
   * <p>Provides a standard collection class for our sets of models, ordered
   * or unordered.  For more information, see the
   * <a href="http://documentcloud.github.com/backbone/#Collection">Backbone
   * documentation</a>.</p>
   */
  Parse.Collection = function (models, options) {
    options = options || {}
    if (options.comparator) {
      this.comparator = options.comparator
    }
    if (options.model) {
      this.model = options.model
    }
    if (options.query) {
      this.query = options.query
    }
    this._reset()
    this.initialize.apply(this, arguments)
    if (models) {
      this.reset(models, {silent: true, parse: options.parse})
    }
  }

  // Define the Collection's inheritable methods.
  _.extend(Parse.Collection.prototype, Parse.Events, {
    // The default model for a collection is just a Parse.Object.
    // This should be overridden in most cases.

    model: Parse.Object,

    /**
     * Initialize is an empty function by default. Override it with your own
     * initialization logic.
     */
    initialize: function () {},

    /**
     * The JSON representation of a Collection is an array of the
     * models' attributes.
     */
    toJSON: function () {
      return this.map(function (model) {
        return model.toJSON()
      })
    },

    /**
     * Add a model, or list of models to the set. Pass **silent** to avoid
     * firing the `add` event for every new model.
     *
     * @param {Array} models An array of instances of <code>Parse.Object</code>.
     *
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are:<ul>
     *   <li>at: The index at which to add the models.
     *   <li>silent: Set to true to avoid firing the `add` event for every new
     *   model.
     * </ul>
     */
    add: function (models, options) {
      var i
      var index
      var length
      var model
      var cid
      var id
      var cids = {}
      var ids = {}
      options = options || {}
      models = _.isArray(models) ? models.slice() : [models]

      // Begin by turning bare objects into model references, and preventing
      // invalid models or duplicate models from being added.
      for (i = 0, length = models.length; i < length; i++) {
        models[i] = this._prepareModel(models[i], options)
        model = models[i]
        if (!model) {
          throw new Error("Can't add an invalid model to a collection")
        }
        cid = model.cid
        if (cids[cid] || this._byCid[cid]) {
          throw new Error("Duplicate cid: can't add the same model " +
            'to a collection twice')
        }
        id = model.id
        if (!Parse._isNullOrUndefined(id) && (ids[id] || this._byId[id])) {
          throw new Error("Duplicate id: can't add the same model " +
            'to a collection twice')
        }
        ids[id] = model
        cids[cid] = model
      }

      // Listen to added models' events, and index models for lookup by
      // `id` and by `cid`.
      for (i = 0; i < length; i++) {
        (model = models[i]).on('all', this._onModelEvent, this)
        this._byCid[model.cid] = model
        if (model.id) {
          this._byId[model.id] = model
        }
      }

      // Insert models into the collection, re-sorting if needed, and triggering
      // `add` events unless silenced.
      this.length += length
      index = Parse._isNullOrUndefined(options.at) ? this.models.length : options.at
      this.models.splice.apply(this.models, [index, 0].concat(models))
      if (this.comparator) {
        this.sort({silent: true})
      }
      if (options.silent) {
        return this
      }
      for (i = 0, length = this.models.length; i < length; i++) {
        model = this.models[i]
        if (cids[model.cid]) {
          options.index = i
          model.trigger('add', model, this, options)
        }
      }
      return this
    },

    /**
     * Remove a model, or a list of models from the set. Pass silent to avoid
     * firing the <code>remove</code> event for every model removed.
     *
     * @param {Array} models The model or list of models to remove from the
     *   collection.
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are: <ul>
     *   <li>silent: Set to true to avoid firing the `remove` event.
     * </ul>
     */
    remove: function (models, options) {
      var i, l, index, model
      options = options || {}
      models = _.isArray(models) ? models.slice() : [models]
      for (i = 0, l = models.length; i < l; i++) {
        model = this.getByCid(models[i]) || this.get(models[i])
        if (!model) {
          continue
        }
        delete this._byId[model.id]
        delete this._byCid[model.cid]
        index = this.indexOf(model)
        this.models.splice(index, 1)
        this.length--
        if (!options.silent) {
          options.index = index
          model.trigger('remove', model, this, options)
        }
        this._removeReference(model)
      }
      return this
    },

    /**
     * Gets a model from the set by id.
     * @param {String} id The Parse objectId identifying the Parse.Object to
     * fetch from this collection.
     */
    get: function (id) {
      return id && this._byId[id.id || id]
    },

    /**
     * Gets a model from the set by client id.
     * @param {} cid The Backbone collection id identifying the Parse.Object to
     * fetch from this collection.
     */
    getByCid: function (cid) {
      return cid && this._byCid[cid.cid || cid]
    },

    /**
     * Gets the model at the given index.
     *
     * @param {Number} index The index of the model to return.
     */
    at: function (index) {
      return this.models[index]
    },

    /**
     * Forces the collection to re-sort itself. You don't need to call this
     * under normal circumstances, as the set will maintain sort order as each
     * item is added.
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are: <ul>
     *   <li>silent: Set to true to avoid firing the `reset` event.
     * </ul>
     */
    sort: function (options) {
      options = options || {}
      if (!this.comparator) {
        throw new Error('Cannot sort a set without a comparator')
      }
      var boundComparator = _.bind(this.comparator, this)
      if (this.comparator.length === 1) {
        this.models = this.sortBy(boundComparator)
      } else {
        this.models.sort(boundComparator)
      }
      if (!options.silent) {
        this.trigger('reset', this, options)
      }
      return this
    },

    /**
     * Plucks an attribute from each model in the collection.
     * @param {String} attr The attribute to return from each model in the
     * collection.
     */
    pluck: function (attr) {
      return _.map(this.models, function (model) {
        return model.get(attr)
      })
    },

    /**
     * When you have more items than you want to add or remove individually,
     * you can reset the entire set with a new list of models, without firing
     * any `add` or `remove` events. Fires `reset` when finished.
     *
     * @param {Array} models The model or list of models to remove from the
     *   collection.
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are: <ul>
     *   <li>silent: Set to true to avoid firing the `reset` event.
     * </ul>
     */
    reset: function (models, options) {
      var self = this
      models = models || []
      options = options || {}
      Parse._arrayEach(this.models, function (model) {
        self._removeReference(model)
      })
      this._reset()
      this.add(models, {silent: true, parse: options.parse})
      if (!options.silent) {
        this.trigger('reset', this, options)
      }
      return this
    },

    /**
     * Fetches the default set of models for this collection, resetting the
     * collection when they arrive. If `add: true` is passed, appends the
     * models to the collection instead of resetting.
     *
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are:<ul>
     *   <li>silent: Set to true to avoid firing `add` or `reset` events for
     *   models fetched by this fetch.
     *   <li>success: A Backbone-style success callback.
     *   <li>error: An Backbone-style error callback.
     *   <li>useMasterKey: In Cloud Code and Node only, uses the Master Key for
     *       this request.
     *   <li>sessionToken: A valid session token, used for making a request on
     *       behalf of a specific user.
     * </ul>
     */
    fetch: function (options) {
      options = _.clone(options) || {}
      if (options.parse === undefined) {
        options.parse = true
      }
      var collection = this
      var query = this.query || new Parse.Query(this.model)
      return query.find({
        useMasterKey: options.useMasterKey,
        sessionToken: options.sessionToken
      }).then(function (results) {
        if (options.add) {
          collection.add(results, options)
        } else {
          collection.reset(results, options)
        }
        return collection
      })._thenRunCallbacks(options, this)
    },

    /**
     * Creates a new instance of a model in this collection. Add the model to
     * the collection immediately, unless `wait: true` is passed, in which case
     * we wait for the server to agree.
     *
     * @param {Parse.Object} model The new model to create and add to the
     *   collection.
     * @param {Object} options An optional object with Backbone-style options.
     * Valid options are:<ul>
     *   <li>wait: Set to true to wait for the server to confirm creation of the
     *       model before adding it to the collection.
     *   <li>silent: Set to true to avoid firing an `add` event.
     *   <li>success: A Backbone-style success callback.
     *   <li>error: An Backbone-style error callback.
     *   <li>useMasterKey: In Cloud Code and Node only, uses the Master Key for
     *       this request.
     *   <li>sessionToken: A valid session token, used for making a request on
     *       behalf of a specific user.
     * </ul>
     */
    create: function (model, options) {
      var coll = this
      options = options ? _.clone(options) : {}
      model = this._prepareModel(model, options)
      if (!model) {
        return false
      }
      if (!options.wait) {
        coll.add(model, options)
      }
      var success = options.success
      options.success = function (nextModel, resp, xhr) {
        if (options.wait) {
          coll.add(nextModel, options)
        }
        if (success) {
          success(nextModel, resp)
        } else {
          nextModel.trigger('sync', model, resp, options)
        }
      }
      model.save(null, options)
      return model
    },

    /**
     * Converts a response into a list of models to be added to the collection.
     * The default implementation is just to pass it through.
     * @ignore
     */
    parse: function (resp, xhr) {
      return resp
    },

    /**
     * Proxy to _'s chain. Can't be proxied the same way the rest of the
     * underscore methods are proxied because it relies on the underscore
     * constructor.
     */
    chain: function () {
      return _(this.models).chain()
    },

    /**
     * Reset all internal state. Called when the collection is reset.
     */
    _reset: function (options) {
      this.length = 0
      this.models = []
      this._byId = {}
      this._byCid = {}
    },

    /**
     * Prepare a model or hash of attributes to be added to this collection.
     */
    _prepareModel: function (model, options) {
      if (!(model instanceof Parse.Object)) {
        var attrs = model
        var ModelConstructor = this.model
        options.collection = this
        model = new ModelConstructor(attrs, options)
        if (!model._validate(model.attributes, options)) {
          model = false
        }
      } else if (!model.collection) {
        model.collection = this
      }
      return model
    },

    /**
     * Internal method to remove a model's ties to a collection.
     */
    _removeReference: function (model) {
      if (this === model.collection) {
        delete model.collection
      }
      model.off('all', this._onModelEvent, this)
    },

    /**
     * Internal method called every time a model in the set fires an event.
     * Sets need to update their indexes when models change ids. All other
     * events simply proxy through. "add" and "remove" events that originate
     * in other collections are ignored.
     */
    _onModelEvent: function (ev, model, collection, options) {
      if ((ev === 'add' || ev === 'remove') && collection !== this) {
        return
      }
      if (ev === 'destroy') {
        this.remove(model, options)
      }
      if (model && ev === 'change:objectId') {
        delete this._byId[model.previous('objectId')]
        this._byId[model.id] = model
      }
      this.trigger.apply(this, arguments)
    }

  })

  // Underscore methods that we want to implement on the Collection.
  var methods = ['forEach', 'each', 'map', 'reduce', 'reduceRight', 'find',
    'detect', 'filter', 'select', 'reject', 'every', 'all', 'some', 'any',
    'include', 'contains', 'invoke', 'max', 'min', 'sortBy', 'sortedIndex',
    'toArray', 'size', 'first', 'initial', 'rest', 'last', 'without', 'indexOf',
    'shuffle', 'lastIndexOf', 'isEmpty', 'groupBy']

  // Mix in each Underscore method as a proxy to `Collection#models`.
  Parse._arrayEach(methods, function (method) {
    Parse.Collection.prototype[method] = function () {
      return _[method].apply(_, [this.models].concat(_.toArray(arguments)))
    }
  })

  /**
   * Creates a new subclass of <code>Parse.Collection</code>.  For example,<pre>
   *   var MyCollection = Parse.Collection.extend({
   *     // Instance properties
   *
   *     model: MyClass,
   *     query: MyQuery,
   *
   *     getFirst: function() {
   *       return this.at(0)
   *     }
   *   }, {
   *     // Class properties
   *
   *     makeOne: function() {
   *       return new MyCollection()
   *     }
   *   })
   *
   *   var collection = new MyCollection()
   * </pre>
   *
   * @function
   * @param {Object} instanceProps Instance properties for the collection.
   * @param {Object} classProps Class properies for the collection.
   * @return {Class} A new subclass of <code>Parse.Collection</code>.
   */
  Parse.Collection.extend = Parse._extend
}(this))
