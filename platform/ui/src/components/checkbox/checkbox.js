import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './checkbox.css';

export class Checkbox extends Component {
  static propTypes = {
    label: PropTypes.string.isRequired,
    checked: PropTypes.bool,
    onChange: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = { checked: props.checked, label: props.label };
  }

  handleChange(e) {
    const checked = e.target.checked;
    this.setState({ checked });
    if (this.props.onChange) this.props.onChange(checked);
  }

  render() {
    let checkbox;
    if (this.state.checked) {
      checkbox = <span className="ohif-checkbox ohif-checked" />;
    } else {
      checkbox = <span className="ohif-checkbox" />;
    }

    return (
      <div className="ohif-check-container">
        <form>
          <label className="ohif-check-label">
            <input
              type="checkbox"
              checked={this.state.checked}
              onChange={e => {
                this.handleChange(e);
              }}
            />
            {checkbox}
            {this.state.label}
          </label>
        </form>
      </div>
    );
  }
}
