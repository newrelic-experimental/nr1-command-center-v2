module.exports = {
  /** ******* Overview *******/
  issuesByPriority: (account, start, end) => {
    // pulls **only open** issues by priority
    return `
    {
      actor {
        account(id: ${account}) {
          aiIssues {
            issues(filter: {states: ACTIVATED}, timeWindow: {endTime: ${end}, startTime: ${start}}) {
              issues {
                issueId
                priority
              }
            }
          }
        }
      }
    }
    `;
  },
  anomalyCount: (account, time) => {
    // pulls **only open** anomalies - watcher (custom) + non-custom
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT count(*) FROM (SELECT uniqueCount(event) as 'total', latest(event) as 'state' FROM NrAiAnomaly where event in ('open', 'close') facet anomalyId limit max) where total = 1 and state = 'open' limit max ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  /** ******* Overview *******/
  /** ******* Open Violations *******/
  openViolations: (account, time) => {
    // get all open violationIds
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT deprecatedIncidentId, priority FROM (SELECT uniqueCount(event) as 'total', latest(event) as 'state', latest(priority) as 'priority' FROM NrAiIncident where event in ('open','close') facet deprecatedIncidentId limit max) where total=1 and state='open' limit max ${time}") {
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
          nrql(query: "FROM NrAiIncident SELECT deprecatedIncidentId, account.id, title, targetName, policyName, conditionName, openTime, priority, muted, incidentLink, description where deprecatedIncidentId IN (${vios}) and event = 'open' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  /** ******* Open Violations *******/
  /** ******* Open Issues *******/
  openIssues: (account, start, end) => {
    // get all activated issues based on time selected
    return `
    {
      actor {
        account(id: ${account}) {
          aiIssues {
            issues(filter: {states: ACTIVATED}, timeWindow: {endTime: ${end}, startTime: ${start}}) {
              issues {
                accountIds
                activatedAt
                acknowledgedBy
                mutingState
                issueId
                totalIncidents
                priority
                incidentIds
                entityNames
                state
                title
              }
            }
          }
        }
      }
    }
    `;
  },
  /** ******* Open Issues *******/
  /** ******* Open Anomalies *******/
  openAnomalies: (account, time) => {
    //get all open anomalyIds
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT anomalyId FROM (SELECT uniqueCount(event) as 'total', latest(event) as 'state' FROM NrAiAnomaly where event in ('open', 'close') facet anomalyId limit max) where total = 1 and state = 'open' limit max ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  openAnomalyData: (account, anoms, time) => {
    //get all open anomalyIds
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "FROM NrAiAnomaly SELECT anomalyId, entity.accountId, title, entity.name, entity.type, openTime, link where anomalyId in (${anoms}) and event = 'open' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },

  /** ******* Open Anomalies *******/
  /** ******* Incident Analytics *******/
  issueCount: (account, time) => {
    // get all opened issues
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT uniqueCount(issueId) as 'count' FROM NrAiIssue where event in ('activate', 'acknowledge') LIMIT MAX ${time}") {
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
  }
  /** ******* Incident Analytics *******/
};
