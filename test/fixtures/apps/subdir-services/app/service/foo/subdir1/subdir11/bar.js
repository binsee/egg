module.exports = function (app) {
  class Bar111 extends app.Service {
    constructor(ctx) {
      super(ctx);
    }

    async get(name) {
      return {
        bar: 'bar111',
      };
    }
  }

  return Bar111;
};
