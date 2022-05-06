import React from 'react';
import { Dropdown, DropdownItem, NerdGraphQuery, Spinner } from 'nr1';
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
    const { accounts } = this.props;
    const proms = [];

    for (const a of accounts) {
      proms.push(this.getViolationCounts(a));
    }

    Promise.all(proms).then(final => {
      this.setState({ cardData: final });
    });
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
      e.target.textContent == 'Warning' ||
      e.target.textContent == 'Healthy'
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

    if (statusText == 'Warning') {
      cardsByStatus = _.orderBy(cardsByStatus, ['warning'], ['desc']);
    }

    if (statusText == 'Healthy') {
      cardsByStatus = _.orderBy(
        cardsByStatus,
        ['critical', 'warning'],
        ['asc', 'asc']
      );
    }

    this.setState({
      cardData: cardsByStatus,
      sortDisplay: statusText
    });
  }

  renderSortDropdown() {
    const { sortDisplay } = this.state;
    const sortItems = ['A-Z', 'Z-A', 'Critical', 'Warning', 'Healthy'];

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

    if (card.warning >= 1 && card.critical == 0) {
      return 'orange';
    }

    if (card.critical == 0 || card.warning == 0) {
      return 'green';
    }
  }

  getIcon(card) {
    if (card.critical >= 1) {
      return 'ban';
    }

    if (card.warning >= 1 && card.critical == 0) {
      return 'exclamation circle';
    }

    if (card.critical == 0 || card.warning == 0) {
      return 'check circle';
    }
  }

  handleCardClick = e => {
    const url = `https://alerts.newrelic.com/accounts/${e.currentTarget.id}/incidents`;
    window.open(url, '_blank');
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
                          {card.warning == undefined ? 0 : card.warning}
                        </Statistic.Value>
                        <Statistic.Label>Warning</Statistic.Label>
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

  async getViolationCounts(acct) {
    const result = await NerdGraphQuery.query({
      query: query.violationsByPriority(acct.id, this.props.time)
    });

    if (result.errors) {
      console.debug(`Failed fetching violations for account: ${acct}`);
      return null;
    } else {
      const vioCounts = result.data.actor.account.nrql.results;

      let warningCount = vioCounts
        .filter(v => v.facet == 'warning')
        .map(w => w.count);
      if (warningCount.length == 0) {
        warningCount = 0;
      } else {
        warningCount = warningCount[0];
      }

      let criticalCount = vioCounts
        .filter(v => v.facet == 'critical')
        .map(c => c.count);
      if (criticalCount.length == 0) {
        criticalCount = 0;
      } else {
        criticalCount = criticalCount[0];
      }

      const anAccount = {
        account: acct.name,
        id: acct.id,
        warning: warningCount,
        critical: criticalCount
      };

      return anAccount;
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
