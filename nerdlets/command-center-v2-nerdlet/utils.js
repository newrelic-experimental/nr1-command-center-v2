module.exports = {
  /** ******* Overview *******/
  issuesByPriority: (account, cursor) => {
    // pulls **only open** issues by priority
    if (cursor == null) {
      return `
      {
        actor {
          entitySearch(query: "domain = 'AIOPS' AND type = 'ISSUE' and tags.source = 'newrelic' AND tags.accountId = '${account}'") {
            results {
              entities {
                name
                accountId
                tags {
                  key
                  values
                }
              }
              nextCursor
            }
          }
        }
      }
      `;
    } else {
      return `
      {
        actor {
          entitySearch(query: "domain = 'AIOPS' AND type = 'ISSUE' and tags.source = 'newrelic' AND tags.accountId = '${account}'") {
            results(cursor: "${cursor}") {
              entities {
                name
                accountId
                tags {
                  key
                  values
                }
              }
              nextCursor
            }
          }
        }
      }
      `;
    }
  },
  /** ******* Overview *******/
  /** ******* Open Violations *******/
  openViolations: (account, time) => {
    // get all open violationIds
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT incidentId, priority FROM (SELECT uniqueCount(event) as 'total', latest(event) as 'state', latest(priority) as 'priority' FROM NrAiIncident where event in ('open','close') and evaluationType != 'anomaly' facet incidentId limit max) where total=1 and state='open' limit max ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  openViolationData: (account, vios, time) => {
    // get all open violationData (based on ID)
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "FROM NrAiIncident SELECT incidentId, account.id, title, targetName, policyName, conditionName, openTime, priority, muted, mutingRuleId, mutingRuleName, incidentLink, description where incidentId IN (${vios}) and event = 'open' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  /** ******* Open Violations *******/
  /** ******* Open Issues *******/
  openIssues: (account, cursor) => {
    // get all activated issues (entities)
    if (cursor == null) {
      return `
      {
        actor {
          entitySearch(query: "domain = 'AIOPS' AND type = 'ISSUE' and tags.source = 'newrelic' AND tags.accountId = '${account}'") {
            results {
              entities {
                name
                accountId
                tags {
                  key
                  values
                }
              }
              nextCursor
            }
          }
        }
      }
      `;
    } else {
      return `
      {
        actor {
          entitySearch(query: "domain = 'AIOPS' AND type = 'ISSUE' and tags.source = 'newrelic' AND tags.accountId = '${account}'") {
            results(cursor: "${cursor}") {
              entities {
                name
                accountId
                tags {
                  key
                  values
                }
              }
              nextCursor
            }
          }
        }
      }
      `;
    }
  },

  userName: (userId) => {
    return `    
      {
        actor {
          users {
            userSearch(query: {scope: {userIds: "${userId}"}}) {
              users {
                email
                name
                userId
              }
            }
          }
        }
      }
    `;
  },

  entityStatusByIssue: (guids) => {
    // 25 guids per call max
    return `
      {
  actor {
    entities(guids: ["${guids}"]) {
      guid
      name
      alertSeverity
      permalink
    }
  }
}
    `;
  },
  /** ******* Open Issues *******/
  /** ******* Incident Analytics *******/
  issueCount: (account, time) => {
    // get all opened issues
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT uniqueCount(issueId) as 'count' FROM NrAiIssue where event in ('activate', 'acknowledge') LIMIT MAX ${time} COMPARE WITH 1 week ago") {
            results
          }
        }
      }
    }
    `;
  },
  issueMinutes: (account, time) => {
    // get total (sum) time issues are open
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT sum(duration_min) as 'minutes' FROM (SELECT ((latest(closeTime) or aggregationendtime()) - latest(activateTime))/1000/60 as 'duration_min' FROM NrAiIssue where event in ('activate', 'close') facet issueId LIMIT MAX) LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  issueMTTR: (account, time) => {
    // get average mtt-resolve
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT average(duration_min) as 'avg' FROM (SELECT ((latest(closeTime) or aggregationendtime()) - latest(activateTime))/1000/60 as 'duration_min' FROM NrAiIssue where event = 'close' facet issueId LIMIT MAX) LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  issueUnder5min: (account, time) => {
    // get % incidents closed under 5 min
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT percentage(count(*), where duration_min <=5) as 'under5' FROM (SELECT ((latest(closeTime) or aggregationendtime()) - latest(activateTime))/1000/60 as 'duration_min' FROM NrAiIssue where event = 'close' facet issueId LIMIT MAX) LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  dashboards: (account, dash) => {
    // template dashboard
    return `
    {
      actor {
        entitySearch(query: "accountId=${account} and type='DASHBOARD' and name='${dash}'") {
          results {
            entities {
              accountId
              guid
              name
              type
            }
          }
        }
      }
    }
    `;
  },
  /** ******* Incident Analytics *******/
  /** ******* Dashboard *******/
  createAqmDashboard: (accountId) => {
    return `
    mutation create($dashboard: DashboardInput!) {
      dashboardCreate(accountId: ${accountId}, dashboard: $dashboard) {
        entityResult {
          guid
          name
        }
        errors {
          description
        }
      }
    }
    `;
  },
  /** ******* Dashboard *******/
};
