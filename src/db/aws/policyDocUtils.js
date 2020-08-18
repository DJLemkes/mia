const { isUser, isAWSAccount, isRole } = require("./arnUtils");

const allowedPrincipals = (principalKey) => (assumeRolePolicyDoc, roleArn) => {
  // Statement may be null
  const betterPolicyDoc = { Statement: [], ...assumeRolePolicyDoc };

  return betterPolicyDoc.Statement.reduce((acc, s) => {
    if (
      s.Effect === "Allow" &&
      s.Action === "sts:AssumeRole" &&
      s.Principal[principalKey]
    ) {
      return acc.concat(
        [s.Principal[principalKey]].flat().map((principal) => ({
          roleArn,
          allowedAssume: principal,
        }))
      );
    } else {
      return acc;
    }
  }, []);
};

const allowedServices = allowedPrincipals("Service");
const allowedARNs = allowedPrincipals("AWS");
const allowedAWSAccounts = (assumeRolePolicyDoc, roleArn) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isAWSAccount(elem.allowedAssume)
  );
const allowedAWSRoles = (assumeRolePolicyDoc, roleArn) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isRole(elem.allowedAssume)
  );
const allowedUsers = (assumeRolePolicyDoc, roleArn) =>
  allowedARNs(assumeRolePolicyDoc, roleArn).filter((elem) =>
    isUser(elem.allowedAssume)
  );

module.exports = {
  allowedServices,
  allowedAWSAccounts,
  allowedAWSRoles,
  allowedUsers,
};
