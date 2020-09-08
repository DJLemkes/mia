const util = require("util");
const ora = require("ora");

const timeAndCount = (
  fn,
  resourceNamePlural,
  resultCounter = (result) => result.length
) => async (...fnArgs) => {
  const debug = require("debug")("");

  const startMessage = `Fetching ${resourceNamePlural}...`;
  let spinner;
  if (debug.enabled) {
    console.log(startMessage);
  } else {
    spinner = ora(`Fetching ${resourceNamePlural}...`).start();
  }

  const start = new Date();
  const results = await fn(...fnArgs);

  const stopMessage = `Fetched ${resultCounter(
    results
  )} ${resourceNamePlural} in ${new Date() - start}ms`;

  if (debug.enabled) {
    console.log(stopMessage);
  } else {
    spinner.succeed(stopMessage);
  }

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
