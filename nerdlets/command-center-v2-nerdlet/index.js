import React from 'react';
import { AccountsQuery, PlatformStateContext, nerdlet, Tooltip } from 'nr1';
import { Dimmer, Dropdown, Icon, Loader, Tab } from 'semantic-ui-react';
import Splash from './splash';
import OpenIncidents from './open-violations';
import OpenIssues from './open-issues';
import OpenAnomalies from './open-anomalies';
import Analytics from './analytics';
import config from './config.json';

export default class CommandCenterV2NerdletNerdlet extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      accounts: [],
      filteredAccounts: [],
      validating: false,
      validUser: false
    };

    this.handleChange = this.handleChange.bind(this);

    this.accountId = config.accountId; // Account ID (preferably a master account) that you have scoped the nerdpack's uuid to.
    this.dashboard = config.templateDashboard; //Name of template dashboard deployed across accounts
  }

  async componentDidMount() {
    nerdlet.setConfig({
      timePickerDefaultOffset: 1000 * 60 * 60 * 24 // default last 24 hours
    });

    await this.setState({ validating: true });
    await this.validateUser(); // check access
    await this.setState({ validating: false });
  }

  async validateUser() {
    const accounts = await AccountsQuery.query();
    if (accounts.error) {
      console.debug(accounts.error);
      this.setState({ validating: false });
    } else {
      this.setState({
        filteredAccounts: accounts.data,
        accounts: accounts.data
      });
      for (const acct of accounts.data) {
        if (acct.id === this.accountId) {
          this.setState({ validUser: true });
          break;
        }
      }
    }
  }

  renderDropdown() {
    const { accounts } = this.state;
    const opts = [];
    const toolTipText =
      'Global multi-account selection - Selected accounts will persist across all tabs. Useful for targeting a specific set of accounts.';

    for (const acct of accounts) {
      opts.push({ key: acct.id, text: acct.name, value: acct.id });
    }

    return (
      <div>
        <Tooltip
          text={toolTipText}
          placementType={Tooltip.PLACEMENT_TYPE.RIGHT}
        >
          <Icon size="large" name="help circle" />
        </Tooltip>
        <Dropdown
          style={{ marginBottom: '6px' }}
          placeholder="Global Account Filter"
          multiple
          search
          selection
          options={opts}
          onChange={this.handleChange}
        />
      </div>
    );
  }

  handleChange(e, { value }) {
    const { accounts } = this.state;

    if (value.length > 0) {
      const filtered = accounts.filter(a => value.includes(a.id));
      this.setState({
        filteredAccounts: filtered
      });
    } else {
      this.setState({
        filteredAccounts: accounts
      });
    }
  }

  render() {
    const { accounts, validating, validUser, filteredAccounts } = this.state;

    if (validating) {
      return (
        <>
          <Dimmer active={validating}>
            <Loader size="medium">Loading</Loader>
          </Dimmer>
        </>
      );
    } else if (validUser) {
      if (accounts.length > 0) {
        return (
          <>
            <PlatformStateContext.Consumer>
              {platformUrlState => {
                let since = '';
                let rawTime = null;
                if (platformUrlState && platformUrlState.timeRange) {
                  if (platformUrlState.timeRange.duration) {
                    since = ` SINCE ${platformUrlState.timeRange.duration /
                      60 /
                      1000} MINUTES AGO`;
                    rawTime = {durationMs: platformUrlState.timeRange.duration};
                  } else if (
                    platformUrlState.timeRange.begin_time &&
                    platformUrlState.timeRange.end_time
                  ) {
                    since = ` SINCE ${platformUrlState.timeRange.begin_time} until ${platformUrlState.timeRange.end_time}`;
                    rawTime = {startTime: platformUrlState.timeRange.begin_time, endTime: platformUrlState.timeRange.end_time};
                  }
                }

                const panes = [
                  {
                    menuItem: 'Overview',
                    render: () => (
                      <Tab.Pane>
                        <Splash time={since} rawTime={rawTime} accounts={filteredAccounts} />
                      </Tab.Pane>
                    )
                  },
                  {
                    menuItem: 'Open Issues',
                    render: () => (
                      <Tab.Pane>
                        <OpenIssues
                          time={since}
                          rawTime={rawTime}
                          accounts={filteredAccounts}
                          nerdStoreAccount={this.accountId}
                        />
                      </Tab.Pane>
                    )
                  },
                  {
                    menuItem: 'Open Incidents',
                    render: () => (
                      <Tab.Pane>
                        <OpenIncidents
                          time={since}
                          accounts={filteredAccounts}
                          nerdStoreAccount={this.accountId}
                        />
                      </Tab.Pane>
                    )
                  },
                  {
                    menuItem: 'Open Anomalies',
                    render: () => (
                      <Tab.Pane>
                        <OpenAnomalies
                          time={since}
                          accounts={filteredAccounts}
                          nerdStoreAccount={this.accountId}
                        />
                      </Tab.Pane>
                    )
                  },
                  {
                    menuItem: 'Analytics',
                    render: () => (
                      <Tab.Pane>
                        <Analytics
                          time={since}
                          accounts={filteredAccounts}
                          dashboard={this.dashboard}
                        />
                      </Tab.Pane>
                    )
                  }
                ];

                return (
                  <>
                    {this.renderDropdown()}
                    <Tab panes={panes} />
                  </>
                );
              }}
            </PlatformStateContext.Consumer>
          </>
        );
      } else {
        return <h3>Accounts could not be retrieved!</h3>;
      }
    } else {
      return <h3>Forbidden - Please validate accountId in config.json</h3>
    }
  }
}
