import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
// TODO: DicomMetadataStore should be injected?
import { DicomMetadataStore } from '@ohif/core';
import { DragAndDropProvider, ImageViewerProvider } from '@ohif/ui';
import { useAccessToken, useStudyInstanceUIDs } from '@state';
import ViewportGrid from '@components/ViewportGrid';
import Compose from './Compose';

async function defaultRouteInit({
  servicesManager,
  studyInstanceUIDs,
  dataSource,
}) {
  const {
    DisplaySetService,
    HangingProtocolService,
  } = servicesManager.services;

  const unsubscriptions = [];
  // TODO: This should be baked into core, not manual?
  // DisplaySetService would wire this up?
  const {
    unsubscribe: instanceAddedUnsubscribe,
  } = DicomMetadataStore.subscribe(
    DicomMetadataStore.EVENTS.INSTANCES_ADDED,
    ({ StudyInstanceUID, SeriesInstanceUID, madeInClient = false }) => {
      const seriesMetadata = DicomMetadataStore.getSeries(
        StudyInstanceUID,
        SeriesInstanceUID
      );

      DisplaySetService.makeDisplaySets(seriesMetadata.instances, madeInClient);
    }
  );

  unsubscriptions.push(instanceAddedUnsubscribe);

  const { unsubscribe: seriesAddedUnsubscribe } = DicomMetadataStore.subscribe(
    DicomMetadataStore.EVENTS.SERIES_ADDED,
    ({ StudyInstanceUID, madeInClient }) => {
      const studyMetadata = DicomMetadataStore.getStudy(StudyInstanceUID);
      if (!madeInClient) {
        HangingProtocolService.run(studyMetadata);
      }
    }
  );
  unsubscriptions.push(seriesAddedUnsubscribe);

  studyInstanceUIDs.forEach(StudyInstanceUID => {
    dataSource.retrieveSeriesMetadata({ StudyInstanceUID });
  });

  return unsubscriptions;
}

export default function ModeRoute({
  mode,
  dataSourceName,
  extensionManager,
  servicesManager,
  hotkeysManager,
}) {
  const [refresh, setRefresh] = useState(false);
  const layoutTemplateData = useRef(false);
  const isMounted = useRef(false);

  const [accessToken] = useAccessToken();
  const [studyInstanceUIDs] = useStudyInstanceUIDs();

  const {
    DisplaySetService,
    HangingProtocolService,
    UserAuthenticationService,
  } = servicesManager.services;

  const { extensions, sopClassHandlers, hotkeys, hangingProtocols } = mode;

  if (dataSourceName === undefined) {
    dataSourceName = extensionManager.defaultDataSourceName;
  }

  extensionManager.setActiveDataSource(dataSourceName);

  const dataSources = extensionManager.getActiveDataSource();

  // Only handling one instance of the datasource type (E.g. one DICOMWeb server)
  const dataSource = dataSources[0];
  // Only handling one route per mode for now
  const route = mode.routes[0];

  // For each extension, look up their context modules
  // TODO: move to extension manager.
  let contextModules = [];
  extensions.forEach(extensionId => {
    const allRegisteredModuleIds = Object.keys(extensionManager.modulesMap);
    const moduleIds = allRegisteredModuleIds.filter(id =>
      id.includes(`${extensionId}.contextModule.`)
    );

    if (!moduleIds || !moduleIds.length) {
      return;
    }

    const modules = moduleIds.map(extensionManager.getModuleEntry);
    contextModules = contextModules.concat(modules);
  });

  const contextModuleProviders = contextModules.map(a => a.provider);
  const CombinedContextProvider = ({ children }) =>
    Compose({ components: contextModuleProviders, children });

  function ViewportGridWithDataSource(props) {
    return ViewportGrid({ ...props, dataSource });
  }

  const getAuthorizationHeader = () => {
    if (accessToken) {
      return {
        Authorization: `Bearer ${accessToken}`,
      };
    }

    return null;
  };

  const handleUnauthenticated = () => {
    console.log('unauthenticated');
    return null;
  };

  useEffect(() => {
    UserAuthenticationService.set({ enabled: true });

    UserAuthenticationService.setServiceImplementation({
      getAuthorizationHeader,
      handleUnauthenticated,
    });
  }, []);

  useEffect(() => {
    // Preventing state update for unmounted component
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const retrieveLayoutData = async () => {
      const layoutData = await route.layoutTemplate({
        location: null,
        servicesManager,
        studyInstanceUIDs,
      });
      if (isMounted.current) {
        layoutTemplateData.current = layoutData;
        setRefresh(!refresh);
      }
    };
    if (studyInstanceUIDs?.length && studyInstanceUIDs[0] !== undefined) {
      retrieveLayoutData();
    }
    return () => {
      layoutTemplateData.current = null;
    };
  }, [studyInstanceUIDs]);

  useEffect(() => {
    if (!hotkeys) {
      return;
    }

    hotkeysManager.setDefaultHotKeys(hotkeys);

    const userPreferredHotkeys = JSON.parse(
      localStorage.getItem('hotkey-definitions')
    );

    if (userPreferredHotkeys?.length) {
      hotkeysManager.setHotkeys(userPreferredHotkeys);
    } else {
      hotkeysManager.setHotkeys(hotkeys);
    }

    return () => {
      hotkeysManager.destroy();
    };
  }, []);

  useEffect(() => {
    if (!layoutTemplateData.current) {
      return;
    }
    // TODO: For some reason this is running before the Providers
    // are calling setServiceImplementationf
    // TOOD -> iterate through services.

    // Extension

    // Add SOPClassHandlers to a new SOPClassManager.
    DisplaySetService.init(extensionManager, sopClassHandlers);

    extensionManager.onModeEnter();
    mode?.onModeEnter({ servicesManager, extensionManager });

    // Adding hanging protocols of extensions after onModeEnter since
    // it will reset the protocols
    hangingProtocols.forEach(extentionProtocols => {
      const hangingProtocolModule = extensionManager.getModuleEntry(
        extentionProtocols
      );
      if (hangingProtocolModule?.protocols) {
        HangingProtocolService.addProtocols(hangingProtocolModule.protocols);
      }
    });

    const setupRouteInit = async () => {
      if (route.init) {
        return await route.init({
          servicesManager,
          extensionManager,
          hotkeysManager,
          studyInstanceUIDs,
          dataSource,
        });
      }

      return await defaultRouteInit({
        servicesManager,
        extensionManager,
        hotkeysManager,
        studyInstanceUIDs,
        dataSource,
      });
    };

    let unsubscriptions;
    setupRouteInit().then(unsubs => {
      unsubscriptions = unsubs;
    });

    return () => {
      extensionManager.onModeExit();
      mode?.onModeExit({ servicesManager, extensionManager });
      unsubscriptions.forEach(unsub => {
        unsub();
      });
    };
  }, [
    mode,
    dataSourceName,
    route,
    servicesManager,
    extensionManager,
    hotkeysManager,
    studyInstanceUIDs,
    refresh,
    hangingProtocols,
  ]);

  const renderLayoutData = props => {
    const layoutTemplateModuleEntry = extensionManager.getModuleEntry(
      layoutTemplateData.current.id
    );
    const LayoutComponent = layoutTemplateModuleEntry.component;

    return <LayoutComponent {...props} />;
  };

  return (
    <ImageViewerProvider
      // initialState={{ StudyInstanceUIDs: StudyInstanceUIDs }}
      StudyInstanceUIDs={studyInstanceUIDs}
      // reducer={reducer}
    >
      <CombinedContextProvider>
        <DragAndDropProvider>
          {layoutTemplateData.current &&
            studyInstanceUIDs?.length &&
            studyInstanceUIDs[0] !== undefined &&
            renderLayoutData({
              ...layoutTemplateData.current.props,
              ViewportGridComp: ViewportGridWithDataSource,
            })}
        </DragAndDropProvider>
      </CombinedContextProvider>
    </ImageViewerProvider>
  );
}

ModeRoute.propTypes = {
  mode: PropTypes.object.isRequired,
  dataSourceName: PropTypes.string,
  extensionManager: PropTypes.object,
  servicesManager: PropTypes.object,
  hotkeysManager: PropTypes.object,
};
