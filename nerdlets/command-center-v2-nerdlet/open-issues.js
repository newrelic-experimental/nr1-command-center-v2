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

export default class OpenIssues extends React.Component {
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
      rowIssueId: null,
      closeModalHidden: true,
      ackModalHidden: true,
      issueToAck: null,
      issueToClose: null,
      ackUser: null,
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
    if (prevProps.time !== this.props.time) {
      await this.setState({ filteredTableData: [], openLoading: true });
      await this.getTableData();
    }

    if (prevProps.accounts.length !== this.props.accounts.length) {
      let tableCopy = this.state.tableData;
      let filteredTable = [];

      for (var s=0; s<tableCopy.length; s++) {
        for (var p=0; p<this.props.accounts.length; p++) {
          if (tableCopy[s].accountIds[0] == this.props.accounts[p].id) {
            filteredTable.push(tableCopy[s]);
          }
        }
      }
      await this.setState({ filteredTableData: filteredTable, openLoading: true });
    }
  }

  async getCurrentUser() {
    const data = await UserQuery.query();
    return data.data;
  }


  async getTableData() {
    const { accounts, rawTime } = this.props;
    const issueProms = [];
    const currTime = new moment().format('LT');
    const exportable = [];
    let table = [];
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

    const links = await this.loadLinksFromNerdStore();
    const acks = await this.loadAcksFromNerdStore();

    for (const acct of accounts) {
      issueProms.push(this.getIssues(acct, start, end));
    }

    Promise.all(issueProms).then(issues => {
      for (let k=0; k < issues.length; k++) {
        if (issues[k].issues.length > 0) {
          for (let i=0; i < issues[k].issues.length; i++) {
            issues[k].issues[i].accountName = issues[k].account;

            let now = moment();
            let activated = issues[k].issues[i].activatedAt/1000;
            let momentActivated = moment.unix(activated);
            let duration = moment.duration(now.diff(momentActivated));
            issues[k].issues[i].duration = duration;

            const oneExportableResult = {
              Account: issues[k].account,
              Title: issues[k].issues[i].title[0],
              IncidentCount: issues[k].issues[i].totalIncidents,
              Entities: issues[k].issues[i].entityNames.toString(),
              Priority: issues[k].issues[i].priority,
              Muted: issues[k].issues[i].mutingState,
              'Opened At': moment.unix(activated).format(
                'MM/DD/YYYY, h:mm a'
              )
            };

            let noteDisplay = null;
            let noteLink = null;
            let ackUser = null;
            if (links.length > 0) {
              for (let p = 0; p < links.length; p++) {
                if (issues[k].issues[i].issueId == links[p].id) {
                  noteDisplay = links[p].document.displayText;
                  noteLink = links[p].document.linkText;
                  break;
                }
              }
            }

            // if (issues[k].issues[i].acknowledgedBy == null) {
              if (acks.length > 0) {
                for (let a = 0; a < acks.length; a++) {
                  if (issues[k].issues[i].issueId == acks[a].id) {
                    ackUser = acks[a].document.user;
                    break;
                  }
                }
              }
            // }
            // else {
            //   //TODO: get userName based on ID - only available in v2 user model
            //   // {
            //   //   actor {
            //   //     users {
            //   //       userSearch(query: {scope: {userIds: "<ack'd by ID>"}}) {
            //   //         users {
            //   //           email
            //   //           name
            //   //           userId
            //   //         }
            //   //       }
            //   //     }
            //   //   }
            //   // }
            //
            //   //
            //   //ackUser = issues[k].issues[i].acknowledgedBy
            // }

            issues[k].issues[i].display = noteDisplay;
            issues[k].issues[i].link = noteLink;
            issues[k].issues[i].ackUser = ackUser;
            oneExportableResult.Link = noteLink;
            exportable.push(oneExportableResult);
            table.push(issues[k].issues[i]);
          } //inner for
        } //if
      } //outer for

      this.setState(
        {
          tableData: table,
          filteredTableData: table,
          exportableData: exportable,
          currentTime: currTime
        },
        () => {
          this.removeOldLinks(links);
          this.removeOldAcks(acks);
          this.setState({ openLoading: false });
        }
      );
      //   this.setState({tableData: formattedTable }, () => {
      //     this.setState({slicedTableData: this.state.tableData.slice(this.state.start, this.state.end)})
      //   })
      // });
    });
  }

  async getIssues(acct, startTime, endTime) {
    const res = await NerdGraphQuery.query({
      query: query.openIssues(acct.id, startTime, endTime)
    });

    if (res.error) {
      console.debug(`Failed to retrieve open issues for: ${acct.id}`);
      const oneAccount = { account: acct.name, id: acct.id, issues: null };
      return oneAccount;
    } else {
      const issues = res.data.actor.account.aiIssues.issues.issues;
      const critCount = issues.filter(i => i.priority == 'CRITICAL').length;
      const warnCount = issues.filter(i => i.priority == 'HIGH').length;
      const oneAccount = {
        account: acct.name,
        id: acct.id,
        warning: warnCount,
        critical: critCount,
        issues: issues
      };

      return oneAccount;
    }
  }

  getWidth(h) {
    switch (h) {
      case 'ID':
        return 2;
        break;
      case 'Account':
        return 2;
        break;
      case 'Title':
        return 6;
        break;
      case 'IncidentCount':
        return 1;
        break;
      case 'Entities':
        return 4;
        break;
      case 'Priority':
        return 1;
        break;
      case 'Entities':
        return 3;
        break;
      case 'Links':
        return 4;
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
        translated = 'issueId';
        break;
      case 'Account':
        translated = 'accountName';
        break;
      case 'Entities':
        translated = 'entityNames';
        break;
      case 'Title':
        translated = 'title';
        break;
      case "IncidentCount":
        translated = 'totalIncidents';
        break;
      case 'Priority':
        translated = 'priority';
        break;
      case 'Opened At':
        translated = 'activatedAt';
        break;
      case 'Duration':
        translated = 'duration';
        break;
      case 'Muted':
        translated = 'mutingState';
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
      rowAccountId: row.accountIds[0],
      rowIssueId: row.issueId
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
      issue => issue.issueId === iKey
    );
    const tableCopy = [...this.state.tableData];
    tableCopy[currentIndex].display = d;
    tableCopy[currentIndex].link = l;
  }

  async saveLinkToNerdStore() {
    const display = this.state.displayText;
    const link = this.state.linkText;
    const docKey = this.state.rowIssueId.toString();

    const hasErrors = await this.validateLinkInput(display, link);

    if (hasErrors) {
      Toast.showToast({
        title: 'Input Validation Error! Please review input.',
        type: Toast.TYPE.CRITICAL
      });
    } else {
      this.updateLinkCell(display, link, docKey); // live update (alleviates having to refresh to pull from nerdstore)
      this.setState(
        {
          linkModalHidden: true
        },
        () => {
          AccountStorageMutation.mutate({
            accountId: this.props.nerdStoreAccount, // store links to account that the nerdpack is published to. must have access to this account to view links.
            actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
            collection: 'IssueLinks',
            documentId: docKey,
            document: {
              displayText: display,
              linkText: link
            }
          })
            .then(data => {
              Toast.showToast({
                title: 'Issue Link Saved!',
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
      collection: 'IssueLinks',
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
        i => i.issueId == lnk.id
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
      collection: 'IssueLinks',
      documentId: docId
    });
  }

  openAckModal(row) {
    this.setState({
      ackModalHidden: false,
      issueToAck: row.issueId,
      rowAccountId: row.accountIds[0],
      ackUser: row.ackUser
    });
  }

  _onCloseAckModal() {
    this.setState({
      ackModalHidden: true,
      issueToAck: null,
      rowAccountId: null,
      ackUser: null
    });
  }

  updateAckCell(issueId, user) {
    const currentTableIndex = this.state.tableData.findIndex(
      issue => issue.issueId === issueId
    );

    const currentFilteredIndex = this.state.filteredTableData.findIndex(
      i => i.issueId === issueId
    );

    const tableCopy = [...this.state.tableData];
    const filteredCopy = [...this.state.filteredTableData];

    filteredCopy[currentFilteredIndex].ackUser = user;
    tableCopy[currentTableIndex].ackUser = user;

    this.setState({
      filteredTableData: filteredCopy
    });
  }



  async ackIssue() {
    let { issueToAck, rowAccountId } = this.state;
    let currentUser = await this.getCurrentUser();

    await this.triggerAckGQL(issueToAck, rowAccountId, currentUser.name);
  }

  async triggerAckGQL(issue, acctId, ackUser) {
    let mutation = `
        mutation {
          aiIssuesAckIssue(accountId: ${acctId}, issueId: "${issue}") {
            error
            result {
              action
              issueId
              accountId
            }
          }
        }
      `;

      const res = await NerdGraphMutation.mutate({
        mutation: mutation
      });

      if (res.error) {
        console.debug(`Failed to ack issue: ${issue} within account: ${acctId}`);
        Toast.showToast({
          title: 'Failed to ack issue.',
          type: Toast.TYPE.CRITICAL
        });
      } else {
        await this.updateAckCell(issue, ackUser);
        this.setState({ ackModalHidden: true });
        AccountStorageMutation.mutate({
          accountId: this.props.nerdStoreAccount,
          actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
          collection: 'IssueAcksV2',
          documentId: issue,
          document: {
            user: ackUser
          }
        })
        .then(data => {
          Toast.showToast({
            title: 'Issue acknowledged!',
            type: Toast.TYPE.Normal
          });
        })
        .catch(error => {
          console.debug(error);
          Toast.showToast({
            title: error.message,
            type: Toast.TYPE.CRITICAL
          });
        });
      }
  }

  async loadAcksFromNerdStore() {
    const allAcks = [];
    AccountStorageQuery.query({
      accountId: this.props.nerdStoreAccount,
      collection: 'IssueAcksV2',
      fetchPolicyType: AccountStorageQuery.FETCH_POLICY_TYPE.CACHE_FIRST
    })
      .then(({ data }) => {
        // add brackets ({data}) for just data, remove them for seeing errors
        if (data.length > 0) {
          for (let z = 0; z < data.length; z++) {
            allAcks.push(data[z]);
          }
        }
      })
      .catch(error => {
        console.debug(error);
      });

    return allAcks;
  }

  removeOldAcks(acksFromNerdStore) {
    const loadedData = this.state.tableData;

    acksFromNerdStore.forEach(ack => {
      const index = loadedData.findIndex(
        i => i.issueId == ack.id
      );
      if (index === -1) {
        this.deleteAckFromNerdStore(ack.id);
      }
    });
  }

  deleteAckFromNerdStore(iId) {
    AccountStorageMutation.mutate({
      accountId: this.props.nerdStoreAccount,
      actionType: AccountStorageMutation.ACTION_TYPE.DELETE_DOCUMENT,
      collection: 'IssueAcksV2',
      documentId: iId
    });
  }

  getInitials(user) {
    var initials = user.match(/\b\w/g) || [];
    initials = ((initials.shift() || '') + (initials.pop() || '')).toUpperCase();
    return initials;
  }

  openCloseModal(row) {
    this.setState({
      closeModalHidden: false,
      issueToClose: row.issueId,
      rowAccountId: row.accountIds[0]
    });
  }

  _onCloseModal() {
    this.setState({
      closeModalHidden: true,
      issueToClose: null,
      rowAccountId: null
    });
  }

  removeRow(issueToClose) {
    let { filteredTableData } = this.state;

    let filteredTableDataCopy = filteredTableData.filter(item => item.issueId !== issueToClose)

    this.setState({
      filteredTableData: filteredTableDataCopy
    });
  }

  async closeIssue() {
    const { issueToClose, rowAccountId } = this.state;
    let mutation = `
        mutation {
          aiIssuesResolveIssue(accountId: ${rowAccountId}, issueId: "${issueToClose}") {
            error
            result {
              action
              issueId
              accountId
            }
          }
        }
      `;

      const res = await NerdGraphMutation.mutate({
        mutation: mutation
      });

      if (res.error) {
        console.debug(`Failed to close issue: ${issue} within account: ${acctId}`);
        Toast.showToast({
          title: 'Failed to close issue.',
          type: Toast.TYPE.CRITICAL
        });
      } else {
        await this.removeRow(issueToClose) //remove row from table
        this.setState({ closeModalHidden: true });
      }
  }

  getFilteredData(searchText) {
    const { tableData } = this.state;
    return tableData.filter(row => {
      return (
        row.accountName.toLowerCase().includes(searchText.toLowerCase()) ||
        row.priority.toLowerCase().includes(searchText.toLowerCase()) ||
        row.title[0].toLowerCase().includes(searchText.toLowerCase()) ||
        row.mutingState.toLowerCase().includes(searchText.toLowerCase()) ||
        row.entityNames.toString().toLowerCase().includes(searchText.toLowerCase())
      );
    });
  }

  getFilteredExportableData(searchText) {
    const { exportableData } = this.state;

    return exportableData.filter(row => {
      return (
        row.Account.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Title.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Priority.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Muted.toLowerCase().includes(searchText.toLowerCase()) ||
        row.Entities.toLowerCase().includes(searchText.toLowerCase())
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
      'Title',
      'IncidentCount',
      'Entities',
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
          display: tableData.length === 0 || tableData == null ? 'none' : 'flex',
          wordBreak: 'break-word'
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

              let a = row.activatedAt/1000;

              return (
                <Table.Row key={p}>
                  <Table.Cell>
                    <a href={`https://radar-api.service.newrelic.com/accounts/${row.accountIds[0].toString()}/issues/${row.issueId}?notifier=&action=`} target="_blank" rel="noreferrer">
                      {row.issueId}
                    </a>
                  </Table.Cell>
                  <Table.Cell>{row.accountName}</Table.Cell>
                  <Table.Cell>{row.title[0]}</Table.Cell>
                  <Table.Cell>{row.totalIncidents}</Table.Cell>
                  <Table.Cell>{row.entityNames.toString()}</Table.Cell>
                  <Table.Cell>{row.priority}</Table.Cell>
                  <Table.Cell>
                    {moment.unix(a).format('MM/DD/YY, h:mm a')}
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
                  <Table.Cell>{row.mutingState == 'NOT_MUTED' ? 'false' : 'true'}</Table.Cell>
                  <Table.Cell>
                  {
                    row.ackUser == null
                    ?
                    <Button
                      onClick={() => this.openAckModal(row)}
                      type={Button.TYPE.PRIMARY}
                      iconType={Button.ICON_TYPE.INTERFACE__OPERATIONS__FOLLOW}
                    />
                    :
                    <Tooltip text={row.ackUser} placementType={Tooltip.PLACEMENT_TYPE.BOTTOM}>
                    <Button
                      style={{"backgroundColor": "black"}}
                      type={Button.TYPE.PRIMARY}
                    >
                    <strong>{this.getInitials(row.ackUser)}</strong>
                    </Button>
                    </Tooltip>
                  }
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
            placeholder="Search Issues..."
            onChange={e => this.handleFilterChange(e)}
          />
          &nbsp;&nbsp;&nbsp;
          <Button
            className="exportIncidents"
            onClick={() => csvDownload(exportableData, 'open_issues.csv')}
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
                Are you sure you want to acknowledge this issue?
              </strong>
            </HeadingText>
            <Button
              type={Button.TYPE.PRIMARY}
              className="modalBtn"
              onClick={() => this.ackIssue()}
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
                Are you sure you want to close this issue?
              </strong>
            </HeadingText>
            <Button
              type={Button.TYPE.PRIMARY}
              className="modalBtn"
              onClick={() => this.closeIssue()}
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
