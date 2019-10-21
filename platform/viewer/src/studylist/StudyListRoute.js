import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Dropzone from 'react-dropzone';
import OHIF from '@ohif/core';
import { withRouter } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import {
  StudyList,
  PageToolbar,
  TablePagination,
  TableSearchFilter,
  useDebounce,
} from '@ohif/ui';
import ConnectedHeader from '../connectedComponents/ConnectedHeader.js';
import * as RoutesUtil from '../routes/routesUtil';
import moment from 'moment';
import ConnectedDicomFilesUploader from '../googleCloud/ConnectedDicomFilesUploader';
import ConnectedDicomStorePicker from '../googleCloud/ConnectedDicomStorePicker';
import filesToStudies from '../lib/filesToStudies.js';

// Contexts
import UserManagerContext from '../context/UserManagerContext';
import WhiteLabellingContext from '../context/WhiteLabellingContext';
import AppContext from '../context/AppContext';

function StudyListRoute(props) {
  const { server, t, user, studyListFunctionsEnabled } = props;
  // ~~ STATE
  const [sort, setSort] = useState({
    fieldName: 'patientName',
    direction: 'desc',
  });
  const [filterValues, setFilterValues] = useState({
    patientName: '',
    patientId: '',
    accessionNumber: '',
    studyDate: '',
    modalities: '',
    studyDescription: '',
    //
    patientNameOrId: '',
    accessionOrModalityOrDescription: '',
    //
    allFields: '',
  });
  const [studies, setStudies] = useState([]);
  const [searchStatus, setSearchStatus] = useState({
    isSearchingForStudies: false,
    error: null,
  });
  const [activeModalId, setActiveModalId] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pageNumber, setPageNumber] = useState(0);
  // ~~ RESPONSIVE
  const displaySize = useMedia(
    ['(min-width: 1750px)', '(min-width: 1000px)', '(min-width: 768px)'],
    ['large', 'medium', 'small'],
    'small'
  );
  // ~~ DEBOUNCED INPUT
  const debouncedSort = useDebounce(sort, 200);
  const debouncedFilters = useDebounce(filterValues, 250);

  // Google Cloud Adapter for DICOM Store Picking
  const { appConfig = {} } = AppContext;
  console.log(AppContext, appConfig);
  const isGoogleCHAIntegrationEnabled =
    !server && appConfig.enableGoogleCloudAdapter;
  if (isGoogleCHAIntegrationEnabled) {
    setActiveModalId('DicomStorePicker');
  }

  // Called when relevant state/props are updated
  // Watches filters and sort, debounced
  useEffect(() => {
    const fetchStudies = async () => {
      try {
        setSearchStatus({ error: null, isSearchingForStudies: true });

        const response = await getStudyList(
          server,
          debouncedFilters,
          debouncedSort,
          rowsPerPage,
          pageNumber,
          displaySize
        );

        setStudies(response);
        setSearchStatus({ error: null, isSearchingForStudies: false });
      } catch (error) {
        console.warn(error);
        setSearchStatus({ error: true, isFetching: false });
      }
    };

    fetchStudies();
  }, [debouncedFilters, debouncedSort, rowsPerPage, pageNumber, displaySize]);

  // TODO: Update Server
  // if (this.props.server !== prevProps.server) {
  //   this.setState({
  //     modalComponentId: null,
  //     searchData: null,
  //     studies: null,
  //   });
  // }

  // TODO: Navigate on Select
  // onSelectItem = studyInstanceUID => {
  //   const { appConfig = {} } = this.context;
  //   const { server } = this.props;
  //   const viewerPath = RoutesUtil.parseViewerPath(appConfig, server, {
  //     studyInstanceUids: studyInstanceUID,
  //   });
  //   this.props.history.push(viewerPath);
  // };

  // static contextType = AppContext;

  const onDrop = async acceptedFiles => {
    try {
      const studiesFromFiles = await filesToStudies(acceptedFiles);
      setStudies(studiesFromFiles);
    } catch (error) {
      setSearchStatus({ isSearchingForStudies: false, error });
    }
  };

  if (searchStatus.error) {
    return <div>Error: {JSON.stringify(searchStatus.error)}</div>;
  } else if (studies === [] && !activeModalId) {
    return <div>Loading...</div>;
  }

  let healthCareApiButtons = null;
  let healthCareApiWindows = null;

  if (appConfig.enableGoogleCloudAdapter) {
    healthCareApiWindows = (
      <ConnectedDicomStorePicker
        isOpen={activeModalId === 'DicomStorePicker'}
        onClose={() => setActiveModalId(null)}
      />
    );

    healthCareApiButtons = (
      <div
        className="form-inline btn-group pull-right"
        style={{ padding: '20px' }}
      >
        <button
          className="btn btn-primary"
          onClick={() => setActiveModalId('DicomStorePicker')}
        >
          {t('Change DICOM Store')}
        </button>
      </div>
    );
  }

  function handleSort(fieldName) {
    let sortFieldName = fieldName;
    let sortDirection = 'asc';

    if (fieldName === sort.fieldName) {
      if (sort.direction === 'asc') {
        sortDirection = 'desc';
      } else {
        sortFieldName = null;
        sortDirection = null;
      }
    }

    setSort({
      fieldName: sortFieldName,
      direction: sortDirection,
    });
  }

  function handleFilterChange(fieldName, value) {
    const updatedFilterValues = Object.assign({}, filterValues);

    updatedFilterValues[fieldName] = value;
    setFilterValues(updatedFilterValues);
  }

  return (
    <>
      <WhiteLabellingContext.Consumer>
        {whiteLabelling => (
          <UserManagerContext.Consumer>
            {userManager => (
              <ConnectedHeader
                home={true}
                user={user}
                userManager={userManager}
              >
                {whiteLabelling.logoComponent}
              </ConnectedHeader>
            )}
          </UserManagerContext.Consumer>
        )}
      </WhiteLabellingContext.Consumer>
      <div className="study-list-header">
        <div className="header">
          <h1 style={{ fontWeight: 300 }}>{t('StudyList')}</h1>
        </div>
        <div className="actions">
          <PageToolbar
            onImport={() => setActiveModalId('DicomFilesUploader')}
          />
          <span className="study-count">{studies.length}</span>
        </div>
      </div>

      <div className="table-head-background" />
      <div className="study-list-container">
        {/* STUDY LIST OR DROP ZONE? */}
        {studies.length ? (
          <StudyList
            loading={searchStatus.isSearchingForStudies}
            // Rows
            studies={studies}
            onSelectItem={studyInstanceUID => {
              console.log(studyInstanceUID);
            }}
            // Table Header
            sort={sort}
            onSort={handleSort}
            filterValues={filterValues}
            onFilterChange={handleFilterChange}
            // onImport={() => setActiveModalId('DicomFilesUploader')}
          >
            {studyListFunctionsEnabled ? (
              <ConnectedDicomFilesUploader
                isOpen={activeModalId === 'DicomFilesUploader'}
                onClose={() => setActiveModalId(null)}
              />
            ) : null}
            {healthCareApiButtons}
            {healthCareApiWindows}
          </StudyList>
        ) : (
          // /LOCAL??????
          <Dropzone onDrop={onDrop}>
            {({ getRootProps, getInputProps }) => (
              <div {...getRootProps()} className={'drag-drop-instructions'}>
                <h3>
                  {t(
                    'Drag and Drop DICOM files here to load them in the Viewer'
                  )}
                </h3>
                <h4>{t("Or click to load the browser's file selector")}</h4>
                <input {...getInputProps()} style={{ display: 'none' }} />
              </div>
            )}
          </Dropzone>
        )}

        {/* PAGINATION FOOTER */}
        <TablePagination
          currentPage={pageNumber}
          nextPageFunc={() => setPageNumber(pageNumber + 1)}
          prevPageFunc={() => setPageNumber(pageNumber - 1)}
          onRowsPerPageChange={rows => setRowsPerPage(rows)}
          rowsPerPage={rowsPerPage}
          recordCount={studies.length}
        />
      </div>
    </>
  );
}

StudyListRoute.propTypes = {
  filters: PropTypes.object,
  patientId: PropTypes.string,
  server: PropTypes.object,
  user: PropTypes.object,
  history: PropTypes.object,
  studyListFunctionsEnabled: PropTypes.bool,
};

StudyListRoute.defaultProps = {
  studyListFunctionsEnabled: true,
};

/**
 *
 *
 * @param {*} server
 * @param {*} filters
 * @param {*} sort
 * @param {number} rowsPerPage
 * @param {number} pageNumber
 * @param {*} displaySize
 * @returns
 */
async function getStudyList(
  server,
  filters,
  sort,
  rowsPerPage,
  pageNumber,
  displaySize
) {
  console.log(filters);
  const defaultValues = {
    currentPage: 0,
    rowsPerPage: 25,
    studyDateFrom: moment()
      .subtract(25000, 'days')
      .toDate(),
    studyDateTo: new Date(),
    sortData: {
      field: 'patientName', // fieldName
      order: 'desc', // direction
    },
  };
  const mergedInput = Object.assign(
    {},
    defaultValues,
    {
      rowsPerPage,
      currentPage: pageNumber,
    },
    filters
  );
  const mappedFilters = {
    patientId: mergedInput.patientId,
    patientName: mergedInput.patientName,
    accessionNumber: mergedInput.accessionNumber,
    studyDescription: mergedInput.studyDescription,
    modalitiesInStudy: mergedInput.modalities,
    // NEVER CHANGE
    studyDateFrom: mergedInput.studyDateFrom,
    studyDateTo: mergedInput.studyDateTo,
    limit: mergedInput.rowsPerPage,
    offset: mergedInput.currentPage * mergedInput.rowsPerPage,
    fuzzymatching: server.supportsFuzzyMatching === true,
  };

  const studies =
    (await OHIF.studies.searchStudies(server, mappedFilters)) || [];

  // Only the fields we use
  const mappedStudies = studies.map(study => {
    return {
      accessionNumber: study.accessionNumber, // "1"
      modalities: study.modalities, // "SEG\\MR"  ​​
      // numberOfStudyRelatedInstances: "3"
      // numberOfStudyRelatedSeries: "3"
      // patientBirthdate: undefined
      patientId: study.patientId, // "NOID"
      patientName: study.patientName, // "NAME^NONE"
      // patientSex: "M"
      // referringPhysicianName: undefined
      studyDate: study.studyDate, // "Jun 28, 2002"
      studyDescription: study.studyDescription, // "BRAIN"
      // studyId: "No Study ID"
      studyInstanceUid: study.studyInstanceUid, // "1.3.6.1.4.1.5962.99.1.3814087073.479799962.1489872804257.3.0"
      // studyTime: "160956.0"
    };
  });

  console.log('raw: ', studies, mappedStudies);

  const { field, order } = mergedInput.sortData;
  const sortedStudies = mappedStudies.map(study => {
    if (!moment(study.studyDate, 'MMM DD, YYYY', true).isValid()) {
      study.studyDate = moment(study.studyDate, 'YYYYMMDD').format(
        'MMM DD, YYYY'
      );
    }
    return study;
  });

  sortedStudies.sort(function(a, b) {
    let fieldA = a[field];
    let fieldB = b[field];
    if (field === 'studyDate') {
      fieldA = moment(fieldA).toISOString();
      fieldB = moment(fieldB).toISOString();
    }
    if (order === 'desc') {
      if (fieldA < fieldB) {
        return -1;
      }
      if (fieldA > fieldB) {
        return 1;
      }
      return 0;
    } else {
      if (fieldA > fieldB) {
        return -1;
      }
      if (fieldA < fieldB) {
        return 1;
      }
      return 0;
    }
  });

  return sortedStudies;
}

export default withRouter(withTranslation('Common')(StudyListRoute));
