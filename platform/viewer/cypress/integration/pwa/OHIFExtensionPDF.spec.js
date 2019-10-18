describe('OHIF PDF Extension', () => {
  before(() => {
    cy.openStudy('Dummy');
    cy.expectMinimumThumbnails(2);
  });

  it('checks if series thumbnails are being displayed', () => {
    cy.get('[data-cy="thumbnail-list"]', { timeout: 10000 })
      .contains('DOC', { timeout: 10000 })
      .its('length')
      .should('to.be.at.least', 1);
  });

  it('drags and drop a PDF thumbnail into viewport', () => {
    cy.get('[data-cy="thumbnail-list"]', { timeout: 10000 })
      .contains('DOC', { timeout: 10000 })
      .drag('.viewport-drop-target');

    cy.get('.DicomPDFViewport')
      .its('length')
      .should('be.eq', 1);

    cy.screenshot();
    cy.percySnapshot();
  });
});
