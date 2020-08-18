const AWS = require("aws-sdk");
const { timeAndCount, traverseAllPages } = require("./utils");

async function fetchLambdas() {
  const lambda = new AWS.Lambda();

  return traverseAllPages(lambda.listFunctions(), "Functions");
}

module.exports = {
  fetchLambdas: timeAndCount(fetchLambdas, "Lambdas"),
};
