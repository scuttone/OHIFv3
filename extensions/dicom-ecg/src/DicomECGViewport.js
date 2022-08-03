import React, { Component, createRef } from 'react';
import PropTypes from 'prop-types';
import TypedArrayProp from './TypedArrayProp';
import { DicomECGViewer } from 'ecg-dicom-web-viewer';

class DicomECGViewport extends Component {
  constructor(props) {
    super(props);
    this.state = {
      fileURL: null,
      error: null,
      currentPageIndex: 1,
      scale: 1,
    };

    this.divView;
    this.canvas = createRef();
    this.textLayer = createRef();
  }

  static propTypes = {
    byteArray: TypedArrayProp.uint8,
    useNative: PropTypes.bool,
    viewportData: PropTypes.object,
    activeViewportIndex: PropTypes.number,
    setViewportActive: PropTypes.func,
    viewportIndex: PropTypes.number,
  };

  static defaultProps = {
    useNative: false,
  };

  //Load Component:
  async componentDidMount() {
    //Element enable:
    const {
      //viewportData,
      setViewportActive,
      viewportIndex,
      activeViewportIndex,
    } = this.props;

    //Enable viewport:
    if (viewportIndex !== activeViewportIndex) {
      setViewportActive(viewportIndex);
    }

    this.setState(state => ({ ...state }));
    if (!this.props.useNative) {
      this.setState(state => ({ ...state }), () => this.loadInstance());
    }
  }

  //On update element:
  componentDidUpdate(prevProps) {
    const { displaySet } = this.props.viewportData;
    const prevDisplaySet = prevProps.viewportData.displaySet;
    if (
      displaySet.displaySetInstanceUID !==
        prevDisplaySet.displaySetInstanceUID ||
      displaySet.SOPInstanceUID !== prevDisplaySet.SOPInstanceUID
    ) {
      this.setState(state => ({ ...state }), () => this.loadInstance());
    }
  }

  render() {
    const style = {
      height: '100%',
      background: 'white',
    };
    this.divView = 'viewECG' + this.props.viewportIndex;
    return <div id={this.divView} style={style}></div>;
  }

  /**
   * Load data:
   */
  loadInstance() {
    //User data display:
    let name = this.props.viewportData.studies[0].PatientName;
    let sex = this.props.viewportData.studies[0].PatientSex;
    let date = this.props.viewportData.studies[0].StudyDate;
    let patientID = this.props.viewportData.studies[0].PatientID;
    let desciption = this.props.viewportData.studies[0].StudyDescription;
    let birth = this.props.viewportData.studies[0].PatientBirthDate;
    let userData = {
      NAME: name,
      SEX: sex,
      DATE: date,
      PATIENT_ID: patientID,
      DESCRIPTION: desciption,
      BIRTH: birth,
    };

    //Load view:
    let viewer = new DicomECGViewer(
      this.props.byteArray,
      this.divView,
      userData,
      this.props.viewportIndex
    );
    viewer.createView();
  }
}

export default DicomECGViewport;
