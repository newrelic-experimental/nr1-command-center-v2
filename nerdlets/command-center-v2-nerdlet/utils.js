module.exports = {
  /** ******* Overview *******/
  violationsByPriority: (account, time) => {
    // pulls **only open** violations by priority
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT count(*) FROM (SELECT uniqueCount(event) as 'total', latest(event) as 'state', latest(priority) as 'priority' FROM NrAiIncident where event in ('open','close') facet deprecatedIncidentId limit max) where total=1 and state='open' facet priority limit max ${time}") {
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
  /** ******* Incident Analytics *******/
  incidentCount: (account, time) => {
    // get all opened incidents
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT count(*) as 'count' FROM NrAiIncident where event = 'open' and priority = 'critical' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  incidentMinutes: (account, time) => {
    // get total (sum) time incidents are open
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "SELECT sum(durationSeconds)/60 as 'minutes' FROM NrAiIncident where event = 'close' and priority = 'critical' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  incidentMTTR: (account, time) => {
    // get average mtt-resolve
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "FROM NrAiIncident SELECT average(durationSeconds)/60 as 'avg' where event = 'close' and priority = 'critical' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  incidentUnder5min: (account, time) => {
    // get % incidents closed under 5 min
    return `
    {
      actor {
        account(id: ${account}) {
          nrql(query: "FROM NrAiIncident SELECT percentage(count(*), where durationSeconds <= 5*60) as 'under5' where event = 'close' and priority = 'critical' LIMIT MAX ${time}") {
            results
          }
        }
      }
    }
    `;
  },
  dashboards: account => {
    // template dashboard
    return `
    {
      actor {
        entitySearch(query: "accountId=${account} and type='DASHBOARD' and name='Operational_Reliability Review'") {
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
