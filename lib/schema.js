// Tiny wrapper around json schema validation.

var JaySchema = require('jayschema');

module.exports = function jsonSchema() {
  var schema = new JaySchema();
  schema.register(require('../schemas/payload.json'));
  schema.register(require('../schemas/result.json'));

  return schema;
}
