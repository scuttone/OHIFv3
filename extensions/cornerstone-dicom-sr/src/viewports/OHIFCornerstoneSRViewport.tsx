import PropTypes from 'prop-types';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OHIF, { utils, ServicesManager, ExtensionManager } from '@ohif/core';
import { setTrackingUniqueIdentifiersForElement } from '../tools/modules/dicomSRModule';

import {
  Icon,
  Notification,
  Tooltip,
  useViewportDialog,
  useViewportGrid,
  ViewportActionBar,
} from '@ohif/ui';
import hydrateStructuredReport from '../utils/hydrateStructuredReport';

const { formatDate } = utils;

const MEASUREMENT_TRACKING_EXTENSION_ID =
  '@ohif/extension-measurement-tracking';

const SR_TOOLGROUP_BASE_NAME = 'SRToolGroup';

function OHIFCornerstoneSRViewport(props) {
  const {
    children,
    dataSource,
    displaySets,
    viewportIndex,
    viewportOptions,
    viewportLabel,
    servicesManager,
    extensionManager,
  } = props;

  const { displaySetService, cornerstoneViewportService, measurementService } =
    servicesManager.services;

  // SR viewport will always have a single display set
  if (displaySets.length > 1) {
    throw new Error('SR viewport should only have a single display set');
  }

  const srDisplaySet = displaySets[0];

  const [viewportGrid, viewportGridService] = useViewportGrid();
  const [viewportDialogState] = useViewportDialog();
  const [measurementSelected, setMeasurementSelected] = useState(0);
  const [measurementCount, setMeasurementCount] = useState(1);
  const [activeImageDisplaySetData, setActiveImageDisplaySetData] =
    useState(null);
  const [referencedDisplaySetMetadata, setReferencedDisplaySetMetadata] =
    useState(null);
  const [element, setElement] = useState(null);
  const { viewports, activeViewportIndex } = viewportGrid;

  // Optional hook into tracking extension, if present.
  let trackedMeasurements;
  let sendTrackedMeasurementsEvent;

  const hasMeasurementTrackingExtension =
    extensionManager.registeredExtensionIds.includes(
      MEASUREMENT_TRACKING_EXTENSION_ID
    );

  if (hasMeasurementTrackingExtension) {
    const contextModule = extensionManager.getModuleEntry(
      '@ohif/extension-measurement-tracking.contextModule.TrackedMeasurementsContext'
    );

    const tracked = useContext(contextModule.context);
    trackedMeasurements = tracked?.[0];
    sendTrackedMeasurementsEvent = tracked?.[1];
  }
  if (!sendTrackedMeasurementsEvent) {
    // if no panels from measurement-tracking extension is used, this code will run
    trackedMeasurements = null;
    sendTrackedMeasurementsEvent = (eventName, { displaySetInstanceUID }) => {
      measurementService.clearMeasurements();
      const { SeriesInstanceUIDs } = hydrateStructuredReport(
        { servicesManager, extensionManager },
        displaySetInstanceUID
      );
      const displaySets = displaySetService.getDisplaySetsForSeries(
        SeriesInstanceUIDs[0]
      );
      if (displaySets.length) {
        viewportGridService.setDisplaySetsForViewport({
          viewportIndex: activeViewportIndex,
          displaySetInstanceUIDs: [displaySets[0].displaySetInstanceUID],
        });
      }
    };
  }

  /**
   * Store the tracking identifiers per viewport in order to be able to
   * show the SR measurements on the referenced image on the correct viewport,
   * when multiple viewports are used.
   */
  const setTrackingIdentifiers = useCallback(
    measurementSelected => {
      const { measurements } = srDisplaySet;

      setTrackingUniqueIdentifiersForElement(
        element,
        measurements.map(measurement => measurement.TrackingUniqueIdentifier),
        measurementSelected
      );
    },
    [element, measurementSelected, srDisplaySet]
  );

  /**
   * OnElementEnabled callback which is called after the cornerstoneExtension
   * has enabled the element. Note: we delegate all the image rendering to
   * cornerstoneExtension, so we don't need to do anything here regarding
   * the image rendering, element enabling etc.
   */
  const onElementEnabled = evt => {
    setElement(evt.detail.element);
  };

  const updateViewport = useCallback(
    newMeasurementSelected => {
      const { StudyInstanceUID, displaySetInstanceUID, sopClassUids } =
        srDisplaySet;

      if (!StudyInstanceUID || !displaySetInstanceUID) {
        return;
      }

      if (sopClassUids && sopClassUids.length > 1) {
        // Todo: what happens if there are multiple SOP Classes? Why we are
        // not throwing an error?
        console.warn(
          'More than one SOPClassUID in the same series is not yet supported.'
        );
      }

      _getViewportReferencedDisplaySetData(
        srDisplaySet,
        newMeasurementSelected,
        displaySetService
      ).then(({ referencedDisplaySet, referencedDisplaySetMetadata }) => {
        setMeasurementSelected(newMeasurementSelected);
        setActiveImageDisplaySetData(referencedDisplaySet);
        setReferencedDisplaySetMetadata(referencedDisplaySetMetadata);

        if (
          referencedDisplaySet.displaySetInstanceUID ===
          activeImageDisplaySetData?.displaySetInstanceUID
        ) {
          const { measurements } = srDisplaySet;

          // it means that we have a new referenced display set, and the
          // imageIdIndex will handle it by updating the viewport, but if they
          // are the same we just need to use measurementService to jump to the
          // new measurement
          const viewportInfo =
            cornerstoneViewportService.getViewportInfoByIndex(viewportIndex);

          const csViewport = cornerstoneViewportService.getCornerstoneViewport(
            viewportInfo.getViewportId()
          );

          const imageIds = csViewport.getImageIds();

          const imageIdIndex = imageIds.indexOf(
            measurements[newMeasurementSelected].imageId
          );

          if (imageIdIndex !== -1) {
            csViewport.setImageIdIndex(imageIdIndex);
          }
        }
      });
    },
    [dataSource, srDisplaySet, activeImageDisplaySetData, viewportIndex]
  );

  const getCornerstoneViewport = useCallback(() => {
    if (!activeImageDisplaySetData) {
      return null;
    }

    const { component: Component } = extensionManager.getModuleEntry(
      '@ohif/extension-cornerstone.viewportModule.cornerstone'
    );

    const { measurements } = srDisplaySet;
    const measurement = measurements[measurementSelected];

    if (!measurement) {
      return null;
    }

    const initialImageIndex = activeImageDisplaySetData.images.findIndex(
      image => image.imageId === measurement.imageId
    );

    return (
      <Component
        {...props}
        // should be passed second since we don't want SR displaySet to
        // override the activeImageDisplaySetData
        displaySets={[activeImageDisplaySetData]}
        viewportOptions={{
          ...viewportOptions,
          toolGroupId: `${SR_TOOLGROUP_BASE_NAME}`,
        }}
        onElementEnabled={onElementEnabled}
        initialImageIndex={initialImageIndex}
      ></Component>
    );
  }, [activeImageDisplaySetData, viewportIndex, measurementSelected]);

  const onMeasurementChange = useCallback(
    direction => {
      let newMeasurementSelected = measurementSelected;

      if (direction === 'right') {
        newMeasurementSelected++;

        if (newMeasurementSelected >= measurementCount) {
          newMeasurementSelected = 0;
        }
      } else {
        newMeasurementSelected--;

        if (newMeasurementSelected < 0) {
          newMeasurementSelected = measurementCount - 1;
        }
      }

      setTrackingIdentifiers(newMeasurementSelected);
      updateViewport(newMeasurementSelected);
    },
    [
      measurementSelected,
      measurementCount,
      updateViewport,
      setTrackingIdentifiers,
    ]
  );

  /**
   Cleanup the SR viewport when the viewport is destroyed
   */
  useEffect(() => {
    const onDisplaySetsRemovedSubscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_REMOVED,
      ({ displaySetInstanceUIDs }) => {
        const activeViewport = viewports[activeViewportIndex];
        if (
          displaySetInstanceUIDs.includes(activeViewport.displaySetInstanceUID)
        ) {
          viewportGridService.setDisplaySetsForViewport({
            viewportIndex: activeViewportIndex,
            displaySetInstanceUIDs: [],
          });
        }
      }
    );

    return () => {
      onDisplaySetsRemovedSubscription.unsubscribe();
    };
  }, []);

  /**
   * Loading the measurements from the SR viewport, which goes through the
   * isHydratable check, the outcome for the isHydrated state here is always FALSE
   * since we don't do the hydration here. Todo: can't we just set it as false? why
   * we are changing the state here? isHydrated is always false at this stage, and
   * if it is hydrated we don't even use the SR viewport.
   */
  useEffect(() => {
    if (!srDisplaySet.isLoaded) {
      srDisplaySet.load();
    }

    const numMeasurements = srDisplaySet.measurements.length;
    setMeasurementCount(numMeasurements);
  }, [srDisplaySet]);

  /**
   * Hook to update the tracking identifiers when the selected measurement changes or
   * the element changes
   */
  useEffect(() => {
    if (!element || !srDisplaySet.isLoaded) {
      return;
    }
    setTrackingIdentifiers(measurementSelected);
  }, [measurementSelected, element, setTrackingIdentifiers, srDisplaySet]);

  /**
   * Todo: what is this, not sure what it does regarding the react aspect,
   * it is updating a local variable? which is not state.
   */
  let isLocked = trackedMeasurements?.context?.trackedSeries?.length > 0;
  useEffect(() => {
    isLocked = trackedMeasurements?.context?.trackedSeries?.length > 0;
  }, [trackedMeasurements]);

  /**
   * Data fetching for the SR displaySet, which updates the measurements and
   * also gets the referenced image displaySet that SR is based on.
   */
  useEffect(() => {
    updateViewport(measurementSelected);
  }, [dataSource, srDisplaySet]);

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  let childrenWithProps = null;

  if (!activeImageDisplaySetData || !referencedDisplaySetMetadata) {
    return null;
  }

  if (children && children.length) {
    childrenWithProps = children.map((child, index) => {
      return (
        child &&
        React.cloneElement(child, {
          viewportIndex,
          key: index,
        })
      );
    });
  }

  const {
    PatientID,
    PatientName,
    PatientSex,
    PatientAge,
    SliceThickness,
    ManufacturerModelName,
    StudyDate,
    SeriesDescription,
    SpacingBetweenSlices,
    SeriesNumber,
  } = referencedDisplaySetMetadata;

  // TODO -> disabled double click for now: onDoubleClick={_onDoubleClick}
  return (
    <>
      <ViewportActionBar
        onDoubleClick={evt => {
          evt.stopPropagation();
          evt.preventDefault();
        }}
        onArrowsClick={onMeasurementChange}
        getStatusComponent={() =>
          _getStatusComponent({
            srDisplaySet,
            viewportIndex,
            isTracked: false,
            isRehydratable: srDisplaySet.isRehydratable,
            isLocked,
            sendTrackedMeasurementsEvent,
          })
        }
        studyData={{
          label: viewportLabel,
          useAltStyling: true,
          studyDate: formatDate(StudyDate),
          seriesDescription: SeriesDescription || '',
          patientInformation: {
            patientName: PatientName
              ? OHIF.utils.formatPN(PatientName.Alphabetic)
              : '',
            patientSex: PatientSex || '',
            patientAge: PatientAge || '',
            MRN: PatientID || '',
            thickness: SliceThickness ? `${SliceThickness.toFixed(2)}mm` : '',
            spacing:
              SpacingBetweenSlices !== undefined
                ? `${SpacingBetweenSlices.toFixed(2)}mm`
                : '',
            scanner: ManufacturerModelName || '',
          },
        }}
      />

      <div className="relative flex flex-row w-full h-full overflow-hidden">
        {getCornerstoneViewport()}
        <div className="absolute w-full">
          {viewportDialogState.viewportIndex === viewportIndex && (
            <Notification
              message={viewportDialogState.message}
              type={viewportDialogState.type}
              actions={viewportDialogState.actions}
              onSubmit={viewportDialogState.onSubmit}
              onOutsideClick={viewportDialogState.onOutsideClick}
            />
          )}
        </div>
        {childrenWithProps}
      </div>
    </>
  );
}

OHIFCornerstoneSRViewport.propTypes = {
  displaySets: PropTypes.arrayOf(PropTypes.object),
  viewportIndex: PropTypes.number.isRequired,
  dataSource: PropTypes.object,
  children: PropTypes.node,
  customProps: PropTypes.object,
  viewportOptions: PropTypes.object,
  servicesManager: PropTypes.instanceOf(ServicesManager).isRequired,
  extensionManager: PropTypes.instanceOf(ExtensionManager).isRequired,
};

OHIFCornerstoneSRViewport.defaultProps = {
  customProps: {},
};

async function _getViewportReferencedDisplaySetData(
  displaySet,
  measurementSelected,
  displaySetService
) {
  const { measurements } = displaySet;
  const measurement = measurements[measurementSelected];

  const { displaySetInstanceUID } = measurement;

  const referencedDisplaySet = displaySetService.getDisplaySetByUID(
    displaySetInstanceUID
  );

  const image0 = referencedDisplaySet.images[0];
  const referencedDisplaySetMetadata = {
    PatientID: image0.PatientID,
    PatientName: image0.PatientName,
    PatientSex: image0.PatientSex,
    PatientAge: image0.PatientAge,
    SliceThickness: image0.SliceThickness,
    StudyDate: image0.StudyDate,
    SeriesDescription: image0.SeriesDescription,
    SeriesInstanceUID: image0.SeriesInstanceUID,
    SeriesNumber: image0.SeriesNumber,
    ManufacturerModelName: image0.ManufacturerModelName,
    SpacingBetweenSlices: image0.SpacingBetweenSlices,
  };

  return { referencedDisplaySetMetadata, referencedDisplaySet };
}

function _getStatusComponent({
  srDisplaySet,
  viewportIndex,
  isRehydratable,
  isLocked,
  sendTrackedMeasurementsEvent,
}) {
  const handleMouseUp = () => {
    sendTrackedMeasurementsEvent('HYDRATE_SR', {
      displaySetInstanceUID: srDisplaySet.displaySetInstanceUID,
      viewportIndex,
    });
  };

  const { t } = useTranslation('Common');
  const loadStr = t('LOAD');

  // 1 - Incompatible
  // 2 - Locked
  // 3 - Rehydratable / Open
  const state =
    isRehydratable && !isLocked ? 3 : isRehydratable && isLocked ? 2 : 1;
  let ToolTipMessage = null;
  let StatusIcon = null;

  switch (state) {
    case 1:
      StatusIcon = () => <Icon name="status-alert" />;

      ToolTipMessage = () => (
        <div>
          This structured report is not compatible
          <br />
          with this application.
        </div>
      );
      break;
    case 2:
      StatusIcon = () => <Icon name="status-locked" />;

      ToolTipMessage = () => (
        <div>
          This structured report is currently read-only
          <br />
          because you are tracking measurements in
          <br />
          another viewport.
        </div>
      );
      break;
    case 3:
      StatusIcon = () => <Icon name="status-untracked" />;

      ToolTipMessage = () => (
        <div>{`Click ${loadStr} to restore measurements.`}</div>
      );
  }

  const StatusArea = () => (
    <div className="flex h-6 leading-6 cursor-default text-sm text-white">
      <div className="min-w-[45px] flex items-center p-1 rounded-l-xl rounded-r bg-customgray-100">
        <StatusIcon />
        <span className="ml-1">SR</span>
      </div>
      {state === 3 && (
        <div
          className="ml-1 px-1.5 rounded cursor-pointer hover:text-black bg-primary-main hover:bg-primary-light"
          // Using onMouseUp here because onClick is not working when the viewport is not active and is styled with pointer-events:none
          onMouseUp={handleMouseUp}
        >
          {loadStr}
        </div>
      )}
    </div>
  );

  return (
    <>
      {ToolTipMessage && (
        <Tooltip content={<ToolTipMessage />} position="bottom-left">
          <StatusArea />
        </Tooltip>
      )}
      {!ToolTipMessage && <StatusArea />}
    </>
  );
}

export default OHIFCornerstoneSRViewport;
