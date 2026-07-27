import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  navigation,
  NerdGraphMutation,
  NerdGraphQuery,
  Spinner,
  Toast,
} from 'nr1';
import { Input } from 'semantic-ui-react';
import orderBy from 'lodash/orderBy';
import sum from 'lodash/sum';

import AnalyticsStats from './components/AnalyticsStats';
import AnalyticsTable from './components/AnalyticsTable';
import ConfirmModal from './components/ConfirmModal';
import useDebouncedValue from './hooks/useDebouncedValue';

const query = require('./utils');
const aqmTemplate = require('./aqm.json');

const TOOLTIP_BY_TITLE = {
  'Issue Count':
    'The total count of opened Issues across all accounts in the time window selected.',
  'Issue Minutes (accumulated)':
    'The total time Issues are open across all accounts in the time window selected.',
  'Avg Issue MTTR (minutes)':
    "The average time to resolve an Issue across all accounts. Calculated by summing MTTR for all accounts and dividing by the number of accounts in the time window selected. All accounts with 'n/a' are excluded.",
  'Issues closed under 5min (%)':
    "The average percentage of Issues closed equal to or under 5 minutes across all accounts. Calculated by summing all percentages and dividing by the number of accounts in the time window selected. All accounts with 'n/a' are excluded.",
};

const COL_MAP = {
  Account: 'account',
  'Account ID': 'id',
  'Issue Count': 'issueCount',
  'Issue Minutes (accumulated)': 'issueMin',
  'Avg Issue MTTR (minutes)': 'issueMTTR',
  '% Issues closed under 5min': 'issueUnder5',
};

function getTooltip(title) {
  return TOOLTIP_BY_TITLE[title] || '';
}

async function fetchSingleDashboard(account) {
  const res = await NerdGraphQuery.query({
    query: query.dashboards(account.id, 'Alert Quality Management'),
  });
  if (res.error) {
    console.debug(
      `Failed to retrieve Alert Quality Management dashboard within account: ${account.id}`
    );
    return { account: account.id, guid: null, name: null };
  }
  const entities = res.data.actor.entitySearch.results.entities;
  if (entities.length > 0) {
    return {
      account: account.id,
      guid: entities[0].guid,
      name: entities[0].name,
    };
  }
  return { account: account.id, guid: null, name: null };
}

async function fetchAccountMetrics(account, time) {
  const [countRes, minRes, mttrRes, under5Res] = await Promise.all([
    NerdGraphQuery.query({ query: query.issueCount(account.id, time) }),
    NerdGraphQuery.query({ query: query.issueMinutes(account.id, time) }),
    NerdGraphQuery.query({ query: query.issueMTTR(account.id, time) }),
    NerdGraphQuery.query({ query: query.issueUnder5min(account.id, time) }),
  ]);

  const pull = (res, field, label) => {
    if (res.error) {
      console.debug(
        `Failed to retrieve ${label} for account: ${account.id}`,
        res.error
      );
      return null;
    }
    return res.data.actor.account.nrql.results[0]?.[field];
  };

  return {
    account: account.name,
    id: account.id,
    issueCount: pull(countRes, 'count', 'issue count'),
    issueMin: pull(minRes, 'minutes', 'issue minutes'),
    issueMTTR: pull(mttrRes, 'avg', 'issue MTTR'),
    issueUnder5: pull(under5Res, 'under5', 'issues under 5min'),
  };
}

function computeAggregate(acctData) {
  const totalIssues = acctData.flatMap((a) =>
    a.issueCount > 0 ? [a.issueCount] : []
  );
  const totalIssueMins = acctData.flatMap((a) =>
    a.issueCount > 0 ? [a.issueMin] : []
  );
  const totalMTTRs = acctData.flatMap((a) =>
    a.issueMTTR !== null ? [a.issueMTTR] : []
  );
  const totalPercentUnder5s = acctData.flatMap((a) =>
    a.issueUnder5 !== null ? [a.issueUnder5] : []
  );

  return {
    'Issue Count': sum(totalIssues),
    'Issue Minutes (accumulated)': sum(totalIssueMins),
    'Avg Issue MTTR (minutes)': totalMTTRs.length
      ? sum(totalMTTRs) / totalMTTRs.length
      : 0,
    'Issues closed under 5min (%)': totalPercentUnder5s.length
      ? sum(totalPercentUnder5s) / totalPercentUnder5s.length
      : 0,
  };
}

export default function Analytics({ time, accounts }) {
  const [loading, setLoading] = useState(true);
  const [aggregateData, setAggregateData] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [dashboards, setDashboards] = useState(null);
  const [sort, setSort] = useState({ column: null, direction: null });

  const [dashModal, setDashModal] = useState({
    hidden: true,
    rowAccountId: null,
  });

  const debouncedSearch = useDebouncedValue(searchText, 200);

  const accountSignature = useMemo(
    () =>
      accounts
        .map((a) => a.id)
        .sort()
        .join(','),
    [accounts]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTableData([]);
    setDashboards(null);

    Promise.all([
      Promise.all(accounts.map((a) => fetchAccountMetrics(a, time))),
      Promise.all(accounts.map((a) => fetchSingleDashboard(a))),
    ])
      .then(([acctData, dashboardData]) => {
        if (!active) return;
        setTableData(acctData);
        setAggregateData(computeAggregate(acctData));
        setDashboards(dashboardData);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.debug('analytics fetch failed', err);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [time, accountSignature]); // eslint-disable-line

  const handleSort = useCallback((clickedCol) => {
    setSort((prev) => {
      const nextDirection =
        prev.column === clickedCol && prev.direction === 'ascending'
          ? 'descending'
          : 'ascending';
      return { column: clickedCol, direction: nextDirection };
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort.column) return tableData;
    const field = COL_MAP[sort.column];
    if (!field) return tableData;
    return orderBy(
      tableData,
      [field],
      sort.direction === 'ascending' ? 'asc' : 'desc'
    );
  }, [tableData, sort]);

  const filteredRows = useMemo(() => {
    const needle = debouncedSearch.toLowerCase();
    if (!needle) return sortedRows;
    return sortedRows.filter(
      (row) =>
        row.account.toLowerCase().includes(needle) ||
        row.id.toString().includes(needle)
    );
  }, [sortedRows, debouncedSearch]);

  const openDashModal = useCallback((row) => {
    setDashModal({
      hidden: false,
      rowAccountId: row.id,
      rowAccountName: row.account,
    });
  }, []);

  const cancelDashModal = useCallback(() => {
    setDashModal({ hidden: true, rowAccountId: null, rowAccountName: null });
  }, []);

  const createDashboard = useCallback(
    async (accountId) => {
      const dashboard = JSON.parse(
        JSON.stringify(aqmTemplate).replace(
          /"accountId":1/g,
          `"accountId":${accountId}`
        )
      );
      let res;
      try {
        res = await NerdGraphMutation.mutate({
          mutation: query.createAqmDashboard(accountId),
          variables: { dashboard },
        });
      } catch (err) {
        Toast.showToast({
          title: err.message || 'Failed to create AQM dashboard',
          type: Toast.TYPE.CRITICAL,
        });
        console.debug(err);
        return;
      }

      if (res.error) {
        Toast.showToast({
          title: 'Failed to create AQM dashboard',
          type: Toast.TYPE.CRITICAL,
        });
        console.debug(res.error);
        return;
      }

      const { errors, entityResult } = res.data?.dashboardCreate ?? {};
      if (errors?.length) {
        Toast.showToast({
          title: errors[0].description,
          type: Toast.TYPE.CRITICAL,
        });
        return;
      }

      setDashboards((prev) =>
        (prev || []).map((d) =>
          d.account === accountId
            ? {
                account: accountId,
                guid: entityResult.guid,
                name: entityResult.name,
              }
            : d
        )
      );
      Toast.showToast({
        title: 'AQM Dashboard created successfully',
        type: Toast.TYPE.NORMAL,
      });
      cancelDashModal();
    },
    [cancelDashModal]
  );

  const openDrilldown = useCallback(
    (r) => {
      const selectedDash =
        dashboards && dashboards.find((d) => d.account === r.id);
      if (!selectedDash || selectedDash.guid == null) {
        Toast.showToast({
          title:
            'AQM dashboard not found. See modal to create it in desired account.',
          type: Toast.TYPE.CRITICAL,
        });
        openDashModal(r);
        return;
      }
      navigation.openStackedNerdlet({
        id: 'dashboards.detail',
        urlState: {
          entityGuid: selectedDash.guid,
          useDefaultTimeRange: false,
        },
      });
    },
    [dashboards]
  );

  if (loading || tableData.length === 0) {
    return (
      <div style={{ textAlign: 'center' }}>
        <h4>Loading</h4>
        <Spinner type={Spinner.TYPE.DOT} />
      </div>
    );
  }

  return (
    <>
      {aggregateData == null ? (
        'Failed to fetch summary data'
      ) : (
        <AnalyticsStats aggregateData={aggregateData} getTooltip={getTooltip} />
      )}
      <Input
        style={{ marginBottom: '3px' }}
        icon="search"
        placeholder="Search Accounts..."
        onChange={(e) => setSearchText(e.target.value)}
      />
      &nbsp;&nbsp;&nbsp;
      <AnalyticsTable
        rows={filteredRows}
        column={sort.column}
        direction={sort.direction}
        onSort={handleSort}
        onOpenDrilldown={openDrilldown}
      />
      <ConfirmModal
        hidden={dashModal.hidden}
        heading={`Create AQM Dashboard in account: ${dashModal.rowAccountName}?`}
        onConfirm={() => createDashboard(dashModal.rowAccountId)}
        onCancel={cancelDashModal}
      />
    </>
  );
}

Analytics.propTypes = {
  time: PropTypes.string.isRequired,
  accounts: PropTypes.array.isRequired,
};

export { getTooltip, computeAggregate };
