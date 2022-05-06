import React from 'react';
import { navigation, NerdGraphQuery, Spinner, Toast, Tooltip } from 'nr1';
import { Card, Icon, Input, Statistic, Table } from 'semantic-ui-react';
import _ from 'lodash';

const query = require('./utils');

export default class Analytics extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      aggregateData: null,
      tableData: [],
      searchText: '',
      selectedAccount: null,
      dashboards: null,
      column: null,
      direction: null
    };
  }

  async componentDidMount() {
    await this.getData();
    await this.fetchDashboards();
    await this.setState({ loading: false });
  }

  async componentDidUpdate(prevProps) {
    if (
      prevProps.time !== this.props.time ||
      prevProps.accounts.length !== this.props.accounts.length
    ) {
      await this.setState({ tableData: [], loading: true });
      await this.getData();
      await this.setState({ loading: false });
    }
  }

  async fetchSingleDashboard(a) {
    const res = await NerdGraphQuery.query({ query: query.dashboards(a.id) });

    if (res.errors) {
      console.debug(`Failed to retrieve incident count for account: ${a.id}`);
    } else {
      let dashboard = res.data.actor.entitySearch.results.entities;

      if (dashboard.length > 0) {
        dashboard = {
          account: a.id,
          guid: dashboard[0].guid,
          name: dashboard[0].name
        };
      } else {
        dashboard = { account: a.id, guid: null, name: null };
      }
      return dashboard;
    }
  }

  async fetchDashboards() {
    const { dashboards } = this.state;
    const { accounts } = this.props;
    const dashProms = [];

    for (const acct of accounts) {
      dashProms.push(this.fetchSingleDashboard(acct));
    }

    Promise.all(dashProms).then(dashResults => {
      this.setState({ dashboards: dashResults });
    });
  }

  async getIncidentCount(a) {
    const res = await NerdGraphQuery.query({
      query: query.incidentCount(a.id, this.props.time)
    });

    if (res.errors) {
      console.debug(`Failed to retrieve incident count for account: ${a.id}`);
    } else {
      const incidentCount = res.data.actor.account.nrql.results[0].count;
      return incidentCount;
    }
  }

  async getIncidentMinutes(a) {
    const res = await NerdGraphQuery.query({
      query: query.incidentMinutes(a.id, this.props.time)
    });

    if (res.errors) {
      console.debug(`Failed to retrieve incident minutes for account: ${a.id}`);
    } else {
      const incidentMin = res.data.actor.account.nrql.results[0].minutes;
      return incidentMin;
    }
  }

  async getIncidentMTTR(a) {
    const res = await NerdGraphQuery.query({
      query: query.incidentMTTR(a.id, this.props.time)
    });

    if (res.errors) {
      console.debug(`Failed to retrieve incident MTTR for account: ${a.id}`);
    } else {
      const incidentMTTR = res.data.actor.account.nrql.results[0].avg;
      return incidentMTTR;
    }
  }

  async getIncidentUnder5(a) {
    const res = await NerdGraphQuery.query({
      query: query.incidentUnder5min(a.id, this.props.time)
    });

    if (res.errors) {
      console.debug(
        `Failed to retrieve incidents under 5min for account: ${a.id}`
      );
    } else {
      const incidentUnder5 = res.data.actor.account.nrql.results[0].under5;
      return incidentUnder5;
    }
  }

  async getAnAccount(acct) {
    return new Promise((resolve, reject) => {
      const anAccountsData = [
        this.getIncidentCount(acct),
        this.getIncidentMinutes(acct),
        this.getIncidentMTTR(acct),
        this.getIncidentUnder5(acct)
      ];
      const all = [];

      Promise.all(anAccountsData).then(anAccount => {
        const result = {
          account: acct.name,
          id: acct.id,
          incidentCount: anAccount[0],
          incidentMin: anAccount[1],
          incidentMTTR: anAccount[2],
          incidentUnder5: anAccount[3]
        };
        // console.log(result);
        resolve(result);
      });
    });
  }

  async getData() {
    const { accounts } = this.props;
    const proms = [];

    for (const acct of accounts) {
      proms.push(this.getAnAccount(acct));
    }

    Promise.all(proms).then(acctData => {
      const totalIncidents = acctData
        .filter(a => a.incidentCount > 0)
        .map(c => c.incidentCount);
      const totalIncidentCount = _.sum(totalIncidents);

      const totalIncidentMins = acctData
        .filter(a => a.incidentCount > 0)
        .map(c => c.incidentMin);
      const totalIncidentMin = _.sum(totalIncidentMins);

      const totalMTTRs = acctData
        .filter(a => a.incidentMTTR !== null)
        .map(c => c.incidentMTTR);
      const totalMTTR = _.sum(totalMTTRs);
      const totalAvgMTTR = totalMTTR / totalMTTRs.length;

      const totalPercentUnder5s = acctData
        .filter(a => a.incidentUnder5 !== null)
        .map(c => c.incidentUnder5);
      const totalPercentUnder5 = _.sum(totalPercentUnder5s);
      const totalAvgUnder5 = totalPercentUnder5 / totalPercentUnder5s.length;

      const totalData = {
        'Incident Count': totalIncidentCount,
        'Incident Minutes (accumulated)': totalIncidentMin,
        'Avg Incident MTTR (minutes)': totalAvgMTTR,
        'Incidents closed under 5min (%)': totalAvgUnder5
      };

      this.setState({ tableData: acctData, aggregateData: totalData });
    });
  }

  getTooltip(title) {
    let text = '';
    switch (title) {
      case 'Incident Count':
        text =
          'The total count of opened incidents across all accounts in the time window selected.';
        break;
      case 'Incident Minutes (accumulated)':
        text =
          'The total time incidents are open across all accounts in the time window selected.';
        break;
      case 'Avg Incident MTTR (minutes)':
        text =
          "The average time to resolve an incident across all accounts. Calculated by summing MTTR for all accounts and dividing by the number of accounts in the time window selected. All accounts with 'n/a' are excluded.";
        break;
      case 'Incidents closed under 5min (%)':
        text =
          "The average percentage of incidents closed under 5min across all accounts. Calculated by summing all percentages and dividing by the number of accounts in the time window selected. All accounts with 'n/a' are excluded.";
        break;
    }

    return text;
  }

  renderStats() {
    const { aggregateData } = this.state;

    return (
      <Card.Group
        style={{ textAlign: 'center', marginBottom: '10px' }}
        itemsPerRow={4}
      >
        {Object.keys(aggregateData).map((dp, i) => {
          return (
            <Card key={i}>
              <Card.Header textAlign="center">
                <h3>
                  <Tooltip
                    text={this.getTooltip(dp)}
                    placementType={Tooltip.PLACEMENT_TYPE.RIGHT}
                  >
                    <Icon name="help circle" />
                  </Tooltip>
                  {dp}
                </h3>
              </Card.Header>
              <Card.Content>
                <Statistic size="mini">
                  <Statistic.Value>
                    {dp.includes('%')
                      ? aggregateData[dp].toFixed(2)
                      : Math.round(aggregateData[dp])}
                  </Statistic.Value>
                </Statistic>
              </Card.Content>
            </Card>
          );
        })}
      </Card.Group>
    );
  }

  handleSort(clickedCol) {
    const { column, direction, tableData } = this.state;
    let translated = null;
    let newTableData = tableData;

    switch (clickedCol) {
      case 'Account':
        translated = 'account';
        break;
      case 'Account ID':
        translated = 'id';
        break;
      case 'Incident Count':
        translated = 'incidentCount';
        break;
      case 'Incident Minutes (accumulated)':
        translated = 'incidentMin';
        break;
      case 'Avg Incident MTTR (minutes)':
        translated = 'incidentMTTR';
        break;
      case '% Incidents closed under 5min':
        translated = 'incidentUnder5';
        break;
    }

    newTableData = _.orderBy(
      newTableData,
      [translated],
      [
        direction === 'ascending' ? 'asc' : 'desc',
        direction === 'ascending' ? 'desc' : 'asc'
      ]
    );

    this.setState({
      column: clickedCol,
      tableData: newTableData,
      direction: direction === 'ascending' ? 'descending' : 'ascending'
    });
  }

  renderTable() {
    const { searchText, tableData, column, direction } = this.state;

    const tableHeaders = [
      'Account',
      'Account ID',
      'Incident Count',
      'Incident Minutes (accumulated)',
      'Avg Incident MTTR (minutes)',
      '% Incidents closed under 5min'
    ];

    return (
      <div
        style={{
          overflowY: 'scroll',
          display: tableData.length === 0 || tableData == null ? 'none' : 'flex'
        }}
      >
        <Table compact selectable sortable celled>
          <Table.Header class="sorted ascending">
            <Table.Row>
              {tableHeaders.map((header, k) => {
                return (
                  <Table.HeaderCell
                    sorted={column === header ? direction : undefined}
                    onClick={() => this.handleSort(header)}
                    key={k}
                  >
                    {header}
                  </Table.HeaderCell>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {tableData
              .filter(row => {
                return (
                  row.account
                    .toLowerCase()
                    .includes(searchText.toLowerCase()) ||
                  row.id.toString().includes(searchText.toLowerCase())
                );
              })
              .map((row, p) => {
                return (
                  <Table.Row key={p}>
                    <Table.Cell onClick={() => this.openDrilldown(row)}>
                      <a>{row.account}</a>
                    </Table.Cell>
                    <Table.Cell>{row.id}</Table.Cell>
                    <Table.Cell>{row.incidentCount}</Table.Cell>
                    <Table.Cell>{Math.round(row.incidentMin)}</Table.Cell>
                    <Table.Cell>
                      {row.incidentMTTR == null
                        ? 'n/a'
                        : Math.round(row.incidentMTTR)}
                    </Table.Cell>
                    <Table.Cell>
                      {row.incidentUnder5 == null
                        ? 'n/a'
                        : row.incidentUnder5.toFixed(2)}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
          </Table.Body>
        </Table>
      </div>
    );
  }

  openDrilldown(r) {
    const { dashboards } = this.state;
    const selectedDash = dashboards.filter(d => d.account == r.id);

    if (selectedDash[0].guid == null) {
      Toast.showToast({
        title: 'Drilldown dashboard not found.',
        description: `Please validate \`Operational/Reliability Review\` dashboard exists in account: ${r.id}`,
        type: Toast.TYPE.CRITICAL
      });
    } else {
      navigation.openStackedNerdlet({
        id: 'dashboards.detail',
        urlState: {
          entityGuid: selectedDash[0].guid,
          useDefaultTimeRange: false
        }
      });
    }
  }

  render() {
    const { loading, tableData, aggregateData, selectedAccount } = this.state;
    // console.log(this.state);

    if (loading || tableData.length == 0) {
      return (
        <div style={{ textAlign: 'center' }}>
          <h4>Loading</h4>
          <Spinner type={Spinner.TYPE.DOT} />
        </div>
      );
    } else {
      return (
        <>
          {aggregateData == null
            ? 'Failed to fetch summary data'
            : this.renderStats()}
          <Input
            style={{ marginBottom: '3px' }}
            icon="search"
            placeholder="Search Accounts..."
            onChange={e => this.setState({ searchText: e.target.value })}
          />
          &nbsp;&nbsp;&nbsp;
          {tableData.length == 0
            ? 'Failed to fetch account data'
            : this.renderTable()}
          {selectedAccount !== null ? this.renderDrilldown() : ''}
        </>
      );
    }
  }
}
