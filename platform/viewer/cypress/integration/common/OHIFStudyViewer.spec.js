describe('OHIF Study Viewer Page', () => {
  before(() => {
    cy.openStudy('MISTER^MR');
    cy.waitDicomImage();
    cy.expectMinimumThumbnails(6);
  });

  beforeEach(() => {
    cy.initCommonElementsAliases();
    cy.resetViewport();
  });

  it('checks if series thumbnails are being displayed', () => {
    cy.screenshot();
    cy.percySnapshot();

    cy.get('[data-cy="thumbnail-list"]')
      .its('length')
      .should('be.gt', 1);
  });

  it('drags and drop a series thumbnail into viewport', () => {
    cy.get('[data-cy="thumbnail-list"]:nth-child(2)') //element to be dragged
      .drag('.cornerstone-canvas'); //dropzone element

    const expectedText =
      'Ser: 2Img: 1 1/13512 x 512Loc: -17.60 mm Thick: 3.00 mm';
    cy.get('@viewportInfoBottomLeft').should('contain.text', expectedText);
  });

  it('checks if Series left panel can be hidden/displayed', () => {
    cy.get('@seriesBtn').click();
    cy.get('@seriesPanel').should('not.be.enabled');

    cy.get('@seriesBtn').click();
    cy.get('@seriesPanel').should('be.visible');
  });

  it('checks if Measurements right panel can be hidden/displayed', () => {
    cy.get('@measurementsBtn').click();
    cy.get('@measurementsPanel').should('be.visible');

    cy.get('@measurementsBtn').click();
    cy.get('@measurementsPanel').should('not.be.enabled');
  });

  it('checks if measurement item can be Relabeled under Measurements panel', () => {
    cy.addLengthMeasurement(); //Adding measurement in the viewport
    cy.get('@measurementsBtn').click();
    cy.get('.measurementItem').click();

    // Click "Relabel"
    cy.get('.btnAction')
      .contains('Relabel')
      .click();

    // Search for "Bone"
    cy.get('.searchInput').type('Bone');

    // Select "Bone" Result
    cy.get('.treeInputs > .wrapperLabel')
      .contains('Bone')
      .click();

    // Confirm Selection
    cy.get('.checkIconWrapper').click();

    // Verify if 'Bone' label was added
    cy.get('.measurementLocation').should('contain.text', 'Bone');
    // Close panel
    cy.get('@measurementsBtn').click();
    cy.get('@measurementsPanel').should('not.be.enabled');
  });

  //TO-DO: Test case will fail due to issue #1013: https://github.com/OHIF/Viewers/issues/1013

  // it('checks if Description can be added to measurement item under Measurements panel', () => {
  //   cy.addLengthMeasurement(); //Adding measurement in the viewport
  //   cy.get('@measurementsBtn').click();
  //   cy.get('.measurementItem').click();
  //
  //   // Click "Description"
  //   cy.get('.btnAction')
  //     .contains('Description')
  //     .click();
  //
  //   // Enter description text
  //   const descriptionText = 'Adding text for description test';
  //   cy.get('#description')
  //     .type(descriptionText);
  //
  //   // Confirm
  //   cy.get('.btn-confirm').click();
  //
  //   //Verify if descriptionText was added
  //   cy.get('.measurementLocation')
  //     .should('contain.text', descriptionText);
  // });

  it('checks if measurement item can be deleted through the context menu on the viewport', () => {
    cy.addLengthMeasurement([100, 100], [200, 100]); //Adding measurement in the viewport

    //Right click on measurement annotation
    const [x1, y1] = [150, 100];
    cy.get('@viewport')
      .trigger('mousedown', x1, y1, {
        which: 3,
      })
      .trigger('mouseup', x1, y1, {
        which: 3,
      });

    //Contextmenu is visible
    cy.get('.ToolContextMenu').should('be.visible');

    //Click "Delete measurement"
    cy.get('.form-action')
      .contains('Delete measurement')
      .click();

    //Open measurements menu
    cy.get('@measurementsBtn').click();

    //Verify measurements was removed from panel
    cy.get('.measurementItem')
      .should('not.exist')
      .log('Annotation removed with success');

    //Close panel
    cy.get('@measurementsBtn').click();
    cy.get('@measurementsPanel').should('not.be.enabled');
  });

  it('adds relabel and description to measurement item through the context menu on the viewport', () => {
    cy.addLengthMeasurement([100, 100], [200, 100]); //Adding measurement in the viewport

    // Relabel
    // Right click on measurement annotation
    const [x1, y1] = [150, 100];
    cy.get('@viewport')
      .trigger('mousedown', x1, y1, {
        which: 3,
      })
      .trigger('mouseup', x1, y1, {
        which: 3,
      });

    // Contextmenu is visible
    cy.get('.ToolContextMenu').should('be.visible');

    // Click "Relabel"
    cy.get('.form-action')
      .contains('Relabel')
      .click();

    // Search for "Brain"
    cy.get('.searchInput').type('Brain');

    // Select "Brain" Result
    cy.get('.treeInputs > .wrapperLabel')
      .contains('Brain')
      .click();

    // Confirm Selection
    cy.get('.checkIconWrapper').click();

    // Description
    // Right click on measurement annotation
    cy.get('@viewport')
      .trigger('mousedown', x1, y1, {
        which: 3,
      })
      .trigger('mouseup', x1, y1, {
        which: 3,
      });

    // Contextmenu is visible
    cy.get('.ToolContextMenu').should('be.visible');

    // Click "Description"
    cy.get('.form-action')
      .contains('Add Description')
      .click();

    // Enter description text
    const descriptionText = 'Adding text for description test';
    cy.get('#description').type(descriptionText);

    // Confirm
    cy.get('.btn-confirm').click();

    //Open measurements menu
    cy.get('@measurementsBtn').click();

    // Verify if label was added
    cy.get('.measurementLocation')
      .should('contain.text', 'Brain')
      .log('Relabel added with success');

    //Verify if descriptionText was added
    cy.get('.measurementLocation')
      .should('contain.text', descriptionText)
      .log('Description added with success');

    // Close panel
    cy.get('@measurementsBtn').click();
    cy.get('@measurementsPanel').should('not.be.enabled');
  });

  it('scrolls series stack using scrollbar', () => {
    // Workaround implemented based on Cypress issue:
    // https://github.com/cypress-io/cypress/issues/1570#issuecomment-450966053
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    cy.get('input.imageSlider[type=range]').then($range => {
      // get the DOM node
      const range = $range[0];
      // set the value manually
      nativeInputValueSetter.call(range, 13);
      // now dispatch the event
      range.dispatchEvent(new Event('change', { value: 13, bubbles: true }));
    });

    const expectedText = 'Img: 13 13/13';
    cy.get('@viewportInfoBottomLeft').should('contains.text', expectedText);
  });

  //TO-DO: this test is blocked due to issue #1072: https://github.com/OHIF/Viewers/issues/1072
  // Uncomment this once #1072 is fixed.
  // it('performs single-click to load thumbnail in active viewport', () => {
  //   cy.get('[data-cy="thumbnail-list"]:nth-child(3)').click();

  //   const expectedText = 'Ser 3';
  //   cy.get('@viewportInfoBottomLeft').should('contains.text', expectedText);
  // });

  it('performs right click to zoom', () => {
    //Right click on viewport
    cy.get('@viewport')
      .trigger('mousedown', 'top', { which: 3 })
      .trigger('mousemove', 'center', { which: 3 })
      .trigger('mouseup');

    const expectedText = 'Zoom: 442%';
    cy.get('@viewportInfoBottomRight').should('contains.text', expectedText);
  });

  it('performs middle click to pan', () => {
    //Get image position from cornerstone and check if y axis was modified
    let cornerstone;
    let currentPan;

    cy.window()
      .its('cornerstone')
      .then(c => {
        cornerstone = c;
        currentPan = () =>
          cornerstone.getEnabledElements()[0].viewport.translation;
      });

    //pan image with middle click
    cy.get('@viewport')
      .trigger('mousedown', 'center', { which: 2 })
      .trigger('mousemove', 'bottom', { which: 2 })
      .trigger('mouseup', 'bottom')
      .then(() => {
        expect(currentPan().y > 0).to.eq(true);
      });
  });

  it('opens About modal and verify the displayed information', () => {
    cy.get('.dd-menu')
      .as('options')
      .click();
    cy.get('.dd-item')
      .as('aboutMenu')
      .click();
    cy.get('.modal-content')
      .as('aboutOverlay')
      .should('be.visible');

    //TO DO:
    //check button links
    //check version number
    //check repository url
  });
});
