const util = require("util");

const timeAndCount = (
  fn,
  resourceNamePlural,
  resultCounter = (result) => result.length
) => async (...fnArgs) => {
  console.log(`Fetching ${resourceNamePlural}...`);
  const start = new Date();
  const results = await fn(...fnArgs);
  console.log(
    `Fetched ${resultCounter(results)} ${resourceNamePlural} in ${
      new Date() - start
    }ms`
  );
  return results;
};

async function traverseAllPages(awsCall, dataKey) {
  return new Promise((resolve) => {
    let allResults = [];
    awsCall.eachPage((err, data) => {
      if (data) {
        allResults = allResults.concat(data[dataKey]);
      } else if (err) {
        throw new Error(`Could not fetch: ${err}`);
      } else {
        resolve(allResults);
      }
    });
  });
}

module.exports = { timeAndCount, traverseAllPages };
