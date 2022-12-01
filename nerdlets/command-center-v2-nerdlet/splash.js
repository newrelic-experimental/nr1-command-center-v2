import React from 'react';
import { Dropdown, DropdownItem, navigation, NerdGraphQuery, Spinner } from 'nr1';
import {
  Card,
  Dimmer,
  Input,
  Icon,
  Loader,
  Statistic
} from 'semantic-ui-react';
import _ from 'lodash';

const query = require('./utils');

export default class Splash extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      cardData: [],
      sortDisplay: 'Sort by',
      searchText: ''
    };
    this.handleSort = this.handleSort.bind(this);
  }

  async componentDidMount() {
    await this.setState({ loading: true });
    await this.getAllData();
    await this.setState({ loading: false });
  }

  async componentDidUpdate(prevProps) {
    if (
      prevProps.time !== this.props.time ||
      prevProps.accounts.length !== this.props.accounts.length
    ) {
      await this.setState({ cardData: [], loading: true });
      await this.getAllData();
      await this.setState({ loading: false });
    }
  }

  async getAllData() {
    const { accounts, rawTime } = this.props;
    const issueProms = [];
    const anomalyProms = [];
    let end = null;
    let start = null;

    if (rawTime.durationMs) {
      end = Date.now();
      start = end - rawTime.durationMs;
    }

    if (rawTime.startTime) {
      end = rawTime.endTime;
      start = rawTime.startTime;
    }

    for (const a of accounts) {
      issueProms.push(this.getIssueCounts(a, start, end));
      anomalyProms.push(this.getAnomalyCount(a));
    }

    let finalIssues = await Promise.all(issueProms);
    let finalAnomalies = await Promise.all(anomalyProms);
    let merged = await _.merge(finalIssues, finalAnomalies);

    this.setState({ cardData: merged });
  }

  handleSort(e) {
    const cardsSorted = this.state.cardData;

    if (e.target.textContent == 'A-Z') {
      cardsSorted.sort(function(a, b) {
        const accountAscA = a.account.toLowerCase();
        const accountAscB = b.account.toLowerCase();

        if (accountAscA < accountAscB) {
          return -1;
        }

        if (accountAscA > accountAscB) {
          return 1;
        }

        return 0;
      });

      this.setState({
        cardData: cardsSorted,
        sortDisplay: e.target.textContent
      });
    }

    if (e.target.textContent == 'Z-A') {
      cardsSorted.sort(function(a, b) {
        const accountDescA = a.account.toLowerCase();
        const accountDescB = b.account.toLowerCase();

        if (accountDescA < accountDescB) {
          return 1;
        }

        if (accountDescA > accountDescB) {
          return -1;
        }

        return 0;
      });
      this.setState({
        cardData: cardsSorted,
        sortDisplay: e.target.textContent
      });
    }

    if (
      e.target.textContent == 'Critical' ||
      e.target.textContent == 'High' ||
      e.target.textContent == 'Healthy' ||
      e.target.textContent == 'Anomalies'
    ) {
      this.sortByStatus(e.target.textContent);
    }
  }

  sortByStatus(statusText) {
    const { cardData } = this.state;
    let cardsByStatus = cardData;

    if (statusText == 'Critical') {
      cardsByStatus = _.orderBy(cardsByStatus, ['critical'], ['desc']);
    }

    if (statusText == 'High') {
      cardsByStatus = _.orderBy(cardsByStatus, ['high'], ['desc']);
    }

    if (statusText == 'Anomalies') {
      cardsByStatus = _.orderBy(cardsByStatus, ['anomalyCount'], ['desc']);
    }

    if (statusText == 'Healthy') {
      cardsByStatus = _.orderBy(
        cardsByStatus,
        ['critical', 'high', 'anomalyCount'],
        ['asc', 'asc', 'asc']
      );
    }

    this.setState({
      cardData: cardsByStatus,
      sortDisplay: statusText
    });
  }

  renderSortDropdown() {
    const { sortDisplay } = this.state;
    const sortItems = ['A-Z', 'Z-A', 'Critical', 'High', 'Anomalies', 'Healthy'];

    return (
      <div className="sortBy">
        <Dropdown
          type={Dropdown.TYPE.NORMAL}
          title={sortDisplay}
          iconType={Dropdown.ICON_TYPE.INTERFACE__ARROW__SORT}
          items={sortItems}
        >
          {({ item, index }) => (
            <DropdownItem key={index} onClick={e => this.handleSort(e)}>
              {item}
            </DropdownItem>
          )}
        </Dropdown>
      </div>
    );
  }

  getCardColor(card) {
    if (card.critical >= 1) {
      return 'red';
    }

    if ((card.high >= 1 || card.anomalyCount >= 1) && card.critical == 0) {
      return 'orange';
    }

    if (card.critical == 0 || card.high == 0 || card.anomalyCount == 0) {
      return 'green';
    }
  }

  getIcon(card) {
    if (card.critical >= 1) {
      return 'ban';
    }

    if ((card.high >= 1 || card.anomalyCount >= 1) && card.critical == 0) {
      return 'exclamation circle';
    }

    if (card.critical == 0 || card.high == 0 || card.anomalyCount == 0) {
      return 'check circle';
    }
  }

  handleCardClick = e => { //TODO: Implement new Issues feed
    const url = `https://alerts.newrelic.com/accounts/${e.currentTarget.id}/incidents`;
    // const url = `https://one.newrelic.com/nrai/feed?account=${e.currentTarget.id}`;
    window.open(url, '_blank');
    // let acct = Number(e.currentTarget.id);

    // navigation.openStackedNerdlet({
    //   id: 'nrai.filtered-feed',
    //   urlState: {
    //     accountId: 1482036
    //   }
    // });
  };

  renderCards() {
    const { cardData, searchText } = this.state;

    return (
      <>
        <Card.Group style={{ textAlign: 'center' }} itemsPerRow={4}>
          {cardData
            .filter(card => {
              return (
                card.account.toLowerCase().includes(searchText.toLowerCase()) ||
                card.id.toString().includes(searchText.toLowerCase())
              );
            })
            .map((card, i) => {
              return (
                <Card
                  key={i}
                  id={card.id}
                  onClick={this.handleCardClick}
                  color={this.getCardColor(card)}
                >
                  <Card.Header>
                    <h2 style={{ color: this.getCardColor(card) }}>
                      <Icon name={this.getIcon(card)} />
                      {card.account}
                    </h2>
                  </Card.Header>
                  <Card.Content>
                    <Statistic.Group
                      style={{ textAlign: 'center', display: 'inline-flex' }}
                    >
                      <Statistic size="mini" color={this.getCardColor(card)}>
                        <Statistic.Value>
                          {card.critical == undefined ? 0 : card.critical}
                        </Statistic.Value>
                        <Statistic.Label>Critical</Statistic.Label>
                      </Statistic>
                      <Statistic size="mini" color={this.getCardColor(card)}>
                        <Statistic.Value>
                          {card.high == undefined ? 0 : card.high}
                        </Statistic.Value>
                        <Statistic.Label>High</Statistic.Label>
                      </Statistic>
                      <Statistic size="mini" color={this.getCardColor(card)}>
                        <Statistic.Value>
                          {card.anomalyCount == undefined ? 0 : card.anomalyCount}
                        </Statistic.Value>
                        <Statistic.Label>Anomalies</Statistic.Label>
                      </Statistic>
                    </Statistic.Group>
                  </Card.Content>
                </Card>
              );
            })}
        </Card.Group>
      </>
    );
  }

  async getIssueCounts(acct, startTime, endTime) {
    let criticalCount = 0;
    let highCount = 0;

    const result = await NerdGraphQuery.query({
      query: query.issuesByPriority(acct.id, startTime, endTime)
    });

    if (result.error) {
      console.debug(`Failed fetching issues for account: ${acct}`);
      return null;
    } else {
      const issueCounts = result.data.actor.account.aiIssues.issues.issues;
      if (issueCounts.length > 0) {
        criticalCount = issueCounts.filter(i => i.priority == 'CRITICAL').length;
        highCount = issueCounts.filter(i => i.priority == 'HIGH').length;
      }
    }

      const anAccount = {
        account: acct.name,
        id: acct.id,
        high: highCount,
        critical: criticalCount
      };

      return anAccount;
    }

  async getAnomalyCount(acct) {
    const result = await NerdGraphQuery.query({
      query: query.anomalyCount(acct.id, this.props.time)
    });

    if (result.error) {
      console.debug(`Failed fetching anomalies for account: ${acct}`);
      return null;
    } else {
      const anomalyCount = result.data.actor.account.nrql.results[0].count;
      const anomRecord = {
        account: acct.name,
        id: acct.id,
        anomalyCount: anomalyCount
      }

      return anomRecord;
    }
  }

  render() {
    const { cardData, loading } = this.state;

    if (loading || cardData.length == 0) {
      return (
        <div style={{ textAlign: 'center' }}>
          <h4>Loading</h4>
          <Spinner type={Spinner.TYPE.DOT} />
        </div>
      );
    } else {
      return (
        <>
          {this.renderSortDropdown()}
          <Input
            style={{ marginBottom: '3px' }}
            icon="search"
            placeholder="Search Accounts..."
            onChange={e => this.setState({ searchText: e.target.value })}
          />
          &nbsp;&nbsp;&nbsp;
          {cardData.length > 0 ? this.renderCards() : 'No Accounts Found'}
        </>
      );
    }
  }
}
