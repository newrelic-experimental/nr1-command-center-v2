import React from 'react';
import {
  Button,
  HeadingText,
  Modal,
  Icon,
  NerdGraphQuery,
  Spinner,
  TextField,
  Toast,
  Tooltip,
  UserQuery
} from 'nr1';
import { Input, Pagination, Table } from 'semantic-ui-react';
import moment from 'moment';
import _ from 'lodash';
import csvDownload from 'json-to-csv-export';
import config from './config.json';

const query = require('./utils');

export default class OpenAnomalies extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      openLoading: true,
      tableData: [],
      filteredTableData: [],
      exportableData: [],
      searchText: '',
      column: null,
      direction: null,
      currentTime: null
    };
  }

  async componentDidMount() {
    await this.getTableData();
    this.interval = setInterval(() => this.getTableData(), config.refreshRate);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  async componentDidUpdate(prevProps) {
    if (
      prevProps.time !== this.props.time ||
      prevProps.accounts.length !== this.props.accounts.length
    ) {
      await this.setState({ filteredTableData: [], openLoading: true });
      await this.getTableData();
    }
  }

  async getTableData() {
    const { accounts, time } = this.props;
    const anomProms = [];
    const currTime = new moment().format('LT');
    const exportable = [];

    for (const acct of accounts) {
      anomProms.push(this.getAnomlyIds(acct));
    }

    Promise.all(anomProms).then(anomalies => {
      const allAnomalies = [];
      for (const aSet of anomalies) {
        if (aSet.anomalies.length > 0) {
          const aArray = aSet.anomalies.map(a => `'${a.anomalyId}'`);
          allAnomalies.push(this.getAnomalyData(aSet, aArray.toString()));
        }
      }

      Promise.all(allAnomalies).then(table => {
        let formattedTable = table.flat();

        var oneExportableResult = null;
        for (let p=0; p < formattedTable.length; p++) {
          if (formattedTable[p] == null) {
            oneExportableResult = null;
          } else {
            oneExportableResult = {
              Account: formattedTable[p].accountName,
              Title: formattedTable[p].title,
              Entity: formattedTable[p]['entity.name'],
              EntityType: formattedTable[p]['entity.type'],
              'Opened At': moment(formattedTable[p].openTime).format('MM/DD/YYYY h:mm a')
            }
            exportable.push(oneExportableResult);
          }
        }

        let all_nulls = formattedTable.every(function(v) { return v === null });

        if (all_nulls) {
          formattedTable = [];
        }

        this.setState({
          tableData: formattedTable,
          filteredTableData: formattedTable,
          exportableData: exportable,
          currentTime: currTime
        }, () => {
          this.setState({ openLoading: false })
        });
      });
    });
  }

  async getAnomlyIds(acct) {
    const res = await NerdGraphQuery.query({
      query: query.openAnomalies(acct.id, this.props.time)
    });

    if (res.error) {
      console.debug(`Failed to retrieve open anomalies for: ${acct.id}`);
      const oneAccount = { account: acct.name, id: acct.id, anomalies: null };
      return oneAccount;
    } else {
      const anomalies = res.data.actor.account.nrql.results;
      const oneAccount = {
        account: acct.name,
        id: acct.id,
        anomalies: anomalies
      };

      return oneAccount;
    }
  }

  async getAnomalyData(aRecord, anoms) {
    if (aRecord.anomalies && aRecord.anomalies.length > 0) {
      const res = await NerdGraphQuery.query({
        query: query.openAnomalyData(aRecord.id, anoms, this.props.time)
      });

      if (res.error) {
        console.debug(
          `Failed to retrieve open anomaly data for: ${aRecord.account}`
        );
      } else {
        const anomData = res.data.actor.account.nrql.results;
        for (const anom of anomData) {
          const now = moment();
          const end = moment(anom.openTime);
          const duration = moment.duration(now.diff(end));
          anom.duration = duration;
          anom.accountName = aRecord.account;
        }
        return anomData;
      }
    } else {
      return null;
    }
  }

  getFilteredData(searchText) {
    const { tableData } = this.state;
    return tableData.filter(row => {
      return (
        row.accountName.toLowerCase().includes(searchText.toLowerCase()) ||
        row['entity.name'].toLowerCase().includes(searchText.toLowerCase()) ||
        row['entity.type'].toLowerCase().includes(searchText.toLowerCase()) ||
        row.title.toLowerCase().includes(searchText.toLowerCase())
      );
    });
  }

  getFilteredExportableData(searchText) {
    const { exportableData } = this.state;

    return exportableData.filter(row => {
      return (
        row.Account.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Title.toLowerCase().includes(searchText.toLowerCase()) ||
        row.EntityType.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Entity.toLowerCase().includes(searchText.toLowerCase())
      );
    });
  }

  handleFilterChange(e) {
    const filterString = e.target.value;

    this.setState({
      searchText: filterString,
      filteredTableData: this.getFilteredData(filterString),
      exportableData: this.getFilteredExportableData(filterString)
    });
  }

  getWidth(h) {
    switch (h) {
      case 'ID':
        return 2;
        break;
      case 'Account':
        return 2;
        break;
      case 'Entity':
        return 3;
        break;
      case 'Type':
        return 2;
        break;
      case 'Title':
        return 3;
        break;
      case 'Opened At':
        return 1;
        break;
      case 'Duration':
        return 1;
        break;
      default:
        return 2;
        break;
    }
  }

  handleSort(clickedCol) {
    const {
      column,
      direction,
      filteredTableData,
      tableData,
      slicedTableData
    } = this.state;
    let translated = null;
    let newTableData = filteredTableData;

    switch (clickedCol) {
      case 'ID':
        translated = 'anomalyId';
        break;
      case 'Account':
        translated = 'accountName';
        break;
      case 'Entity':
        translated = 'entity.name';
        break;
      case 'Type':
        translated = 'entity.type';
        break;
      case 'Title':
        translated = 'title';
        break;
      case 'Opened At':
        translated = 'openTime';
        break;
      case 'Duration':
        translated = 'duration';
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
      filteredTableData: newTableData,
      direction: direction === 'ascending' ? 'descending' : 'ascending'
    });
    // }, () => {
    //   this.setState({
    //     slicedTableData: this.state.tableData.slice(this.state.start, this.state.end)
    //   })
  }

  renderTable() {
    const {
      searchText,
      filteredTableData,
      tableData,
      slicedTableData,
      column,
      direction,
      activePage
    } = this.state;

    const tableHeaders = [
      'ID',
      'Account',
      'Entity',
      'Type',
      'Title',
      'Opened At',
      'Duration'
    ]

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
                      width={this.getWidth(header)}
                      key={k}
                    >
                      {header}
                    </Table.HeaderCell>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredTableData.map((row, p) => {
              return (
                <Table.Row key={p}>
                  <Table.Cell>
                    <a href={row.link} target="_blank" rel="noreferrer">
                      {row.anomalyId}
                    </a>
                  </Table.Cell>
                  <Table.Cell>{row.accountName}</Table.Cell>
                  <Table.Cell>{row['entity.name']}</Table.Cell>
                  <Table.Cell>{row['entity.type']}</Table.Cell>
                  <Table.Cell>{row.title}</Table.Cell>
                  <Table.Cell>
                    {moment(row.openTime).format('MM/DD/YYYY, h:mm a')}
                  </Table.Cell>
                  <Table.Cell>
                    {row.duration.get('days') > 0
                      ? `${row.duration.get('days')}d `
                      : ''}
                    {row.duration.get('hours') > 0
                      ? `${row.duration.get('hours')}hr `
                      : ''}
                    {row.duration.get('minutes') > 0
                      ? `${row.duration.get('minutes')}m `
                      : ''}
                    {row.duration.get('seconds') > 0
                      ? `${row.duration.get('seconds')}s `
                      : ''}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </div>
    )
  }

  render() {
    const {
      currentTime,
      exportableData,
      filteredTableData,
      openLoading,
      searchText,
      tableData
    } = this.state;

    let render = <Spinner />

    if (openLoading && tableData.length == 0) {
      render = (
        <div style={{ textAlign: 'center' }}>
          <h4>Loading</h4>
          <Spinner type={Spinner.TYPE.DOT} />
        </div>
      );
    } else if (!openLoading && tableData.length == 0) {
      render = (
        <div>
          <h3>No open anomalies found during the time window selected!</h3>
          <span className="refreshLabel">
            Last Refreshed: <strong>{currentTime}</strong>
          </span>
        </div>
      );
    } else {
      render = (
        <>
          <Input
            style={{ marginBottom: '3px' }}
            icon="search"
            placeholder="Search Anomalies..."
            onChange={e => this.handleFilterChange(e)}
          />
          &nbsp;&nbsp;&nbsp;
          <Button
            className="exportIncidents"
            onClick={() => csvDownload(exportableData, 'open_anomalies.csv')}
            type={Button.TYPE.PRIMARY}
            iconType={Button.ICON_TYPE.INTERFACE__OPERATIONS__EXPORT}
          >
            Export
          </Button>
          {this.renderTable()}
          <span className="refreshLabel">
            Last Refreshed: <strong>{currentTime}</strong>
          </span>
        </>
      )
    }

    return <>{render}</>;
  }
}
