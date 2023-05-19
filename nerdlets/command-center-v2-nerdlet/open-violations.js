import React from 'react';
import {
  AccountStorageMutation,
  AccountStorageQuery,
  Button,
  HeadingText,
  Modal,
  Icon,
  NerdGraphMutation,
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

export default class OpenIncidents extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      openLoading: true,
      tableData: [],
      filteredTableData: [],
      // slicedTableData: [],
      exportableData: [],
      searchText: '',
      column: null,
      direction: null,
      // activePage: 1,
      // begin: 0,
      // end: 25,
      linkModalHidden: true,
      linkText: null,
      displayText: null,
      rowAccountId: null,
      rowIncidentId: null,
      ackModalHidden: true,
      closeModalHidden: true,
      incToAck: null,
      incToClose: null,
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

  async getCurrentUser() {
    const data = await UserQuery.query();
    return data.data.name;
  }

  async getTableData() {
    const { accounts, time } = this.props;
    const vioProms = [];
    const currTime = new moment().format('LT');
    const exportable = [];

    const links = await this.loadLinksFromNerdStore();
    // let acks = await this.loadAcksFromNerdStore();

    for (const acct of accounts) {
      vioProms.push(this.getViolationIds(acct));
    }

    Promise.all(vioProms).then(violations => {
      const allViolations = [];
      for (const vSet of violations) {
        const vArray = vSet.violations.map(v => `'${v.incidentId}'`).join(',');
        allViolations.push(this.getViolationData(vSet, vArray.toString()));
      }

      Promise.all(allViolations).then(table => {
        const formattedTable = table.flat();

        for (let k = 0; k < formattedTable.length; k++) {
          const oneExportableResult = {
            Account: formattedTable[k].accountName,
            'Policy Name': formattedTable[k].policyName,
            'Condition Name': formattedTable[k].conditionName,
            Entity: formattedTable[k].targetName,
            Description: formattedTable[k].title,
            Priority: formattedTable[k].priority,
            'Opened At': moment(formattedTable[k].openTime).format(
              'MM/DD/YYYY, h:mm a'
            ),
            Muted: formattedTable[k].muted.toString()
          };
          let noteDisplay = null;
          let noteLink = null;
          for (let p = 0; p < links.length; p++) {
            if (formattedTable[k].incidentId == Number(links[p].id)) {
              noteDisplay = links[p].document.displayText;
              noteLink = links[p].document.linkText;
              break;
            }
          }
          formattedTable[k].display = noteDisplay;
          formattedTable[k].link = noteLink;
          oneExportableResult.Link = noteLink;
          exportable.push(oneExportableResult);
        }

        this.setState(
          {
            tableData: formattedTable,
            filteredTableData: formattedTable,
            exportableData: exportable,
            currentTime: currTime
          },
          () => {
            this.removeOldLinks(links);
            this.setState({ openLoading: false });
          }
        );
        // this.setState({tableData: formattedTable }, () => {
        //   this.setState({slicedTableData: this.state.tableData.slice(this.state.start, this.state.end)})
        // })
      });
    });
  }

  async getViolationIds(acct) {
    const res = await NerdGraphQuery.query({
      query: query.openViolations(acct.id, this.props.time)
    });

    if (res.error) {
      console.debug(`Failed to retrieve open violations for: ${acct.id}`);
      const oneAccount = { account: acct.name, id: acct.id, violations: null };
      return oneAccount;
    } else {
      const violations = res.data.actor.account.nrql.results;
      const critCount = violations.filter(v => v.priority == 'critical').length;
      const warnCount = violations.filter(v => v.priority == 'warning').length;
      const oneAccount = {
        account: acct.name,
        id: acct.id,
        warning: warnCount,
        critical: critCount,
        violations: violations
      };

      return oneAccount;
    }
  }

  async getViolationData(aRecord, vios) {
    const res = await NerdGraphQuery.query({
      query: query.openViolationData(aRecord.id, vios, this.props.time)
    });

    if (res.error) {
      console.debug(
        `Failed to retrieve open violation data for: ${aRecord.account}`
      );
    } else {
      const vioData = res.data.actor.account.nrql.results;
      for (const vio of vioData) {
        const now = moment();
        const end = moment(vio.openTime);
        const duration = moment.duration(now.diff(end));
        vio.duration = duration;
        vio.accountName = aRecord.account;
      }
      return vioData;
    }
  }

  getWidth(h) {
    switch (h) {
      case 'ID':
        return 1;
        break;
      case 'Title':
        return 4;
        break;
      case 'Description':
        return 5;
        break;
      case 'Account':
        return 2;
        break;
      case 'Policy Name':
        return 2;
        break;
      case 'Priority':
        return 2;
        break;
      case 'Entity':
        return 2;
        break;
      case 'Links':
        return 6;
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
        translated = 'incidentId';
        break;
      case 'Account':
        translated = 'accountName';
        break;
      case 'Policy Name':
        translated = 'policyName';
        break;
      case 'Condition Name':
        translated = 'conditionName';
        break;
      case 'Entity':
        translated = 'targetName';
        break;
      case 'Title':
        translated = 'title';
        break;
      case 'Priority':
        translated = 'priority';
        break;
      case 'Opened At':
        translated = 'openTime';
        break;
      case 'Duration':
        translated = 'duration';
        break;
      case 'Muted':
        translated = 'muted';
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

  // async onPaginationChange(activePage) {
  //   await this.setState({ activePage });
  //   await this.setState({ begin: this.state.activePage * 25 - 25});
  //   await this.setState({ end: this.state.activePage * 25});
  //
  //   this.setState({
  //     slicedTableData: this.state.tableData.slice(this.state.begin, this.state.end)
  //   })
  // }

  // <Table.Footer>
  //   <Table.Row>
  //     <Table.HeaderCell colSpan="8">
  //       <Pagination
  //         activePage={activePage}
  //         onPageChange={(e, { activePage }) => this.onPaginationChange(activePage)}
  //         totalPages={totalPages}
  //       />
  //     </Table.HeaderCell>
  //   </Table.Row>
  // </Table.Footer>

  openLinkModal(row) {
    this.setState({
      linkModalHidden: false,
      rowAccountId: row['account.id'],
      rowIncidentId: row.incidentId
    });
  }

  _onCloseLinkModal() {
    this.setState({
      linkModalHidden: true,
      displayText: '',
      linkText: ''
    });
  }

  validateLinkInput(disT, linkT) {
    if (disT == null || disT == undefined || disT == '') {
      return true;
    }

    if (linkT == null || linkT == undefined || linkT == '') {
      return true;
    }

    return false;
  }

  resetFormFields() {
    this.setState({
      displayText: '',
      linkText: ''
    });
  }

  updateLinkCell(d, l, iKey) {
    const currentIndex = this.state.tableData.findIndex(
      inc => inc.incidentId === iKey
    );
    const tableCopy = [...this.state.tableData];
    tableCopy[currentIndex].display = d;
    tableCopy[currentIndex].link = l;
  }

  async saveLinkToNerdStore() {
    const display = this.state.displayText;
    const link = this.state.linkText;
    const docKey = this.state.rowIncidentId.toString();

    const hasErrors = await this.validateLinkInput(display, link);

    if (hasErrors) {
      Toast.showToast({
        title: 'Input Validation Error! Please review input.',
        type: Toast.TYPE.CRITICAL
      });
    } else {
      this.updateLinkCell(display, link, Number(docKey)); // live update (alleviates having to refresh to pull from nerdstore)
      this.setState(
        {
          linkModalHidden: true
        },
        () => {
          AccountStorageMutation.mutate({
            accountId: this.props.nerdStoreAccount, // store links to account that the nerdpack is published to. must have access to this account to view links.
            actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
            collection: 'IncidentLinksV2',
            documentId: docKey,
            document: {
              displayText: display,
              linkText: link
            }
          })
            .then(data => {
              Toast.showToast({
                title: 'Incident Link Saved!',
                type: Toast.TYPE.Normal
              });
              this.resetFormFields();
            })
            .catch(error => {
              console.debug(error);
              Toast.showToast({
                title: error.message,
                type: Toast.TYPE.CRITICAL
              });
            });
        }
      );
    }
  }

  async loadLinksFromNerdStore() {
    const allLinks = [];
    AccountStorageQuery.query({
      accountId: this.props.nerdStoreAccount,
      collection: 'IncidentLinksV2',
      fetchPolicyType: AccountStorageQuery.FETCH_POLICY_TYPE.CACHE_FIRST
    })
      .then(({ data }) => {
        // add brackets ({data}) for just data, remove them for seeing errors
        if (data.length > 0) {
          for (let z = 0; z < data.length; z++) {
            allLinks.push(data[z]);
          }
        }
      })
      .catch(error => {
        console.debug(error);
      });

    return allLinks;
  }

  removeOldLinks(linksFromNerdStore) {
    const loadedData = this.state.tableData;

    linksFromNerdStore.forEach(lnk => {
      const index = loadedData.findIndex(
        v => v.incidentId == Number(lnk.id)
      );
      if (index === -1) {
        this.deleteLinkFromNerdStore(lnk.id);
      }
    });
  }

  deleteLinkFromNerdStore(docId) {
    AccountStorageMutation.mutate({
      accountId: this.props.nerdStoreAccount,
      actionType: AccountStorageMutation.ACTION_TYPE.DELETE_DOCUMENT,
      collection: 'IncidentLinksV2',
      documentId: docId
    });
  }

  openAckModal(row) {
    this.setState({
      ackModalHidden: false,
      incToAck: row.incidentId
    });
  }

  _onCloseAckModal() {
    this.setState({
      ackModalHidden: true,
      incToAck: null
    });
  }

  // async ackIncident() {
  //   //TODO: Need GQL Mutation
  //   let { incToAck } = this.state;
  //   let currentUser = await this.getCurrentUser();
  //
  //   //let r = await this.triggerAckGQL(incToAck);
  // }

  // saveAckToNerdStore(usr, aInc) {
  //   //TODO: Need GQL Mutation
  // }
  //
  // loadAcksFromNerdStore() {
  //   //TODO: Need GQL Mutation
  // }
  //
  // deleteAckFromNerdStore(ackId) {
  //   //TODO: Need GQL Mutation
  // }
  //
  // removeOldAcks() {
  //   //TODO: Need GQL Mutation
  // }

  getFilteredData(searchText) {
    const { tableData } = this.state;
    return tableData.filter(row => {
      return (
        row.accountName.toLowerCase().includes(searchText.toLowerCase()) ||
        row.conditionName.toLowerCase().includes(searchText.toLowerCase()) ||
        row.policyName.toLowerCase().includes(searchText.toLowerCase()) ||
        row.priority.toLowerCase().includes(searchText.toLowerCase()) ||
        row.targetName.toLowerCase().includes(searchText.toLowerCase()) ||
        row.title.toLowerCase().includes(searchText.toLowerCase())
      );
    });
  }

  getFilteredExportableData(searchText) {
    const { exportableData } = this.state;

    return exportableData.filter(row => {
      return (
        row.Account.toLowerCase().includes(searchText.toLowerCase()) ||
        row['Condition Name']
          .toLowerCase()
          .includes(searchText.toLowerCase()) ||
        row['Policy Name'].toLowerCase().includes(searchText.toLowerCase()) ||
        row.Priority.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Entity.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Description.toLowerCase().includes(searchText.toLowerCase())
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

  openCloseModal(row) {
    this.setState({
      closeModalHidden: false,
      incToClose: row.incidentId,
      rowAccountId: row['account.id']
    });
  }

  _onCloseModal() {
    this.setState({
      closeModalHidden: true,
      incToClose: null,
      rowAccountId: null
    });
  }

  removeRow(incidentToClose) {
    let { filteredTableData } = this.state;

    let filteredTableDataCopy = filteredTableData.filter(item => item.incidentId !== incidentToClose)

    this.setState({
      filteredTableData: filteredTableDataCopy
    });
  }

  async closeIncident() {
    const { incToClose, rowAccountId } = this.state;
    let mutation = `
        mutation {
          aiIssuesCloseIncident(accountId: ${rowAccountId}, incidentId: "${incToClose}") {
            error
            incidentId
            accountId
          }
        }
      `;

      const res = await NerdGraphMutation.mutate({
        mutation: mutation
      });

      if (res.error || res.data.aiIssuesCloseIncident.error) {
        console.debug(`Failed to close incident: ${incToClose} within account: ${rowAccountId}`);
        Toast.showToast({
          title: 'Failed to close incident.',
          type: Toast.TYPE.CRITICAL
        });
      } else {
        await this.removeRow(incToClose) //remove row from table
        this.setState({ closeModalHidden: true });
        Toast.showToast({
          title: 'Incident closed!',
          type: Toast.TYPE.Normal
        });
      }
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
      'Policy Name',
      'Condition Name',
      'Entity',
      'Title',
      'Description',
      'Priority',
      'Opened At',
      'Duration',
      'Muted',
      'Ack',
      'Close',
      'Links'
    ];

    // let maxResultsPerPage = 25;
    // let totalPages = Math.ceil(tableData.length / maxResultsPerPage)

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
                let toolTipText = null;
                if (header == 'Ack') {
                  toolTipText = 'No GQL API available for incident acknowledgement';
                }
                if (header == 'Description') {
                  toolTipText = 'Custom Violation Description'
                }
                return (
                  <Tooltip text={toolTipText}>
                    <Table.HeaderCell
                      sorted={column === header ? direction : undefined}
                      onClick={() => this.handleSort(header)}
                      width={this.getWidth(header)}
                      key={k}
                    >
                      {header}
                    </Table.HeaderCell>
                  </Tooltip>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredTableData.map((row, p) => {
              return (
                <Table.Row key={p}>
                  <Table.Cell>
                    <a href={row.incidentLink} target="_blank" rel="noreferrer">
                      {row.incidentId}
                    </a>
                  </Table.Cell>
                  <Table.Cell><p>{row.accountName}</p></Table.Cell>
                  <Table.Cell>{row.policyName}</Table.Cell>
                  <Table.Cell><p style={{wordBreak: 'break-word'}}>{row.conditionName}</p></Table.Cell>
                  <Table.Cell><p>{row.targetName}</p></Table.Cell>
                  <Table.Cell><p>{row.title}</p></Table.Cell>
                  <Table.Cell>{row.description}</Table.Cell>
                  <Table.Cell>{row.priority == 'warning' ? 'warn' : row.priority}</Table.Cell>
                  <Table.Cell>
                    {moment(row.openTime).format('MM/DD/YY, h:mm a')}
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
                  <Table.Cell>{row.muted.toString()}</Table.Cell>
                  <Table.Cell>
                    <Button
                      disabled
                      onClick={() => this.openAckModal(row)}
                      type={Button.TYPE.PRIMARY}
                      iconType={Button.ICON_TYPE.INTERFACE__OPERATIONS__FOLLOW}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      onClick={() => this.openCloseModal(row)}
                      type={Button.TYPE.PRIMARY}
                      iconType={
                        Button.ICON_TYPE.INTERFACE__OPERATIONS__ALERT__A_REMOVE
                      }
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <div style={{ display: 'inline-flex' }}>
                      <Button
                        onClick={() => this.openLinkModal(row)}
                        type={Button.TYPE.PRIMARY}
                        iconType={
                          Button.ICON_TYPE.DOCUMENTS__DOCUMENTS__NOTES__A_EDIT
                        }
                      />
                      <a
                        className="notesLink"
                        href={row.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.display}
                      </a>
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </div>
    );
  }

  render() {
    const {
      currentTime,
      displayText,
      exportableData,
      filteredTableData,
      linkText,
      openLoading,
      searchText,
      tableData
    } = this.state;

    let render = <Spinner />;

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
          <h3>No open incidents found during the time window selected!</h3>
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
            placeholder="Search Incidents..."
            onChange={e => this.handleFilterChange(e)}
          />
          &nbsp;&nbsp;&nbsp;
          <Button
            className="exportIncidents"
            onClick={() => csvDownload(exportableData, 'open_incidents.csv')}
            type={Button.TYPE.PRIMARY}
            iconType={Button.ICON_TYPE.INTERFACE__OPERATIONS__EXPORT}
          >
            Export
          </Button>
          {this.renderTable()}
          <span className="refreshLabel">
            Last Refreshed: <strong>{currentTime}</strong>
          </span>
          <Modal
            hidden={this.state.linkModalHidden}
            onClose={() => this._onCloseLinkModal()}
          >
            <HeadingText>
              <strong>Edit Link</strong>
            </HeadingText>
            <TextField
              style={{ marginRight: '2px' }}
              value={displayText || ''}
              onChange={e => this.setState({ displayText: e.target.value })}
              label="Text to Display"
            />
            <TextField
              value={linkText || ''}
              onChange={e => this.setState({ linkText: e.target.value })}
              label="Link To"
            />
            <br />
            <Button
              type={Button.TYPE.PRIMARY}
              className="modalBtn"
              onClick={() => this.saveLinkToNerdStore()}
            >
              Save
            </Button>
            <Button
              type={Button.TYPE.DESTRUCTIVE}
              className="modalBtn"
              onClick={() => this._onCloseLinkModal()}
            >
              Close
            </Button>
          </Modal>
          <Modal
            hidden={this.state.ackModalHidden}
            onClose={() => this._onCloseAckModal()}
          >
            <HeadingText>
              <strong>
                Are you sure you want to acknowledge this incident?
              </strong>
            </HeadingText>
            <Button
              type={Button.TYPE.PRIMARY}
              className="modalBtn"
              onClick={() => this.ackIncident()}
            >
              Yes
            </Button>
            <Button
              type={Button.TYPE.DESTRUCTIVE}
              className="modalBtn"
              onClick={() => this._onCloseAckModal()}
            >
              No
            </Button>
          </Modal>
          <Modal
            hidden={this.state.closeModalHidden}
            onClose={() => this._onCloseModal()}
          >
            <HeadingText>
              <strong>
                Are you sure you want to close this incident?
              </strong>
            </HeadingText>
            <Button
              type={Button.TYPE.PRIMARY}
              className="modalBtn"
              onClick={() => this.closeIncident()}
            >
              Yes
            </Button>
            <Button
              type={Button.TYPE.DESTRUCTIVE}
              className="modalBtn"
              onClick={() => this._onCloseModal()}
            >
              No
            </Button>
          </Modal>
        </>
      );
    }

    return <>{render}</>;
  }
}
