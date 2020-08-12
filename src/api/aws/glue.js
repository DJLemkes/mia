const AWS = require("aws-sdk");
const { traverseAllPages, timeAndCount } = require("./utils");

async function fetchGlueJobs() {
  const glue = new AWS.Glue({ region: "eu-central-1" });

  const jobNames = await traverseAllPages(glue.listJobs(), "JobNames");

  return Promise.all(
    jobNames.map((jn) =>
      glue
        .getJob({ JobName: jn })
        .promise()
        .then((data) => data.Job)
    )
  );
}

module.exports = { fetchGlueJobs: timeAndCount(fetchGlueJobs, "Glue jobs") };
