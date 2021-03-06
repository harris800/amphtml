/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview This is a layer that lays its children out into a grid. Its
 * implementation is based off of the CSS Grid Spec.
 *
 * Example:
 * <code>
 * <amp-story-grid-layer template="fill">
 *   ...
 * </amp-story-grid-layer>
 * </code>
 */

import {Layout} from '../../../src/layout';

/**
 * A mapping of attribute names we support for grid layers to the CSS Grid
 * properties they control.
 * @private @const {!Object<string, string>}
 */
const SUPPORTED_CSS_GRID_ATTRIBUTES = {
  'align-content': 'alignContent',
  'align-items': 'alignItems',
  'align-self': 'alignSelf',
  'grid-area': 'gridArea',
  'justify-content': 'justifyContent',
  'justify-items': 'justifyItems',
  'justify-self': 'justifySelf',
};

/**
 * Converts the keys of the SUPPORTED_CSS_GRID_ATTRIBUTES object above into a
 * selector for the specified attributes.
 * (e.g. [align-content], [align-items], ...)
 * @private @const {string}
 */
const SUPPORTED_CSS_GRID_ATTRIBUTES_SELECTOR =
    Object.keys(SUPPORTED_CSS_GRID_ATTRIBUTES)
    .map(key => `[${key}]`)
    .join(',');

/**
 * The attribute name for grid layer templates.
 * @private @const {string}
 */
const TEMPLATE_ATTRIBUTE_NAME = 'template';

/**
 * A mapping of template attribute values to CSS class names.
 * @private @const {!Object<string, string>}
 */
const TEMPLATE_CLASS_NAMES = {
  'fill': 'i-amphtml-story-grid-template-fill',
  'vertical': 'i-amphtml-story-grid-template-vertical',
  'horizontal': 'i-amphtml-story-grid-template-horizontal',
  'thirds': 'i-amphtml-story-grid-template-thirds',
};

export class AmpStoryGridLayer extends AMP.BaseElement {
  /** @override */
  buildCallback() {
    this.applyTemplateClassName_();
    this.setOwnCssGridStyles_();
    this.setDescendentCssGridStyles_();
  }


  /** @override */
  prerenderAllowed() {
    return true;
  }


  /**
   * Applies internal CSS class names for the template attribute, so that styles
   * can use the class name instead of compound
   * amp-story-grid-layer[template="..."] selectors, since the latter increases
   * CSS specificity and can prevent users from being able to override styles.
   * @private
   */
  applyTemplateClassName_() {
    if (this.element.hasAttribute(TEMPLATE_ATTRIBUTE_NAME)) {
      const templateName = this.element.getAttribute(TEMPLATE_ATTRIBUTE_NAME);
      const templateClassName = TEMPLATE_CLASS_NAMES[templateName];
      this.element.classList.add(templateClassName);
    }
  }


  /**
   * Copies the whitelisted CSS grid styles for descendants of the
   * <amp-story-grid-layer> element.
   * @private
   */
  setDescendentCssGridStyles_() {
    const elementsToUpgradeStyles = this.element
        .querySelectorAll(SUPPORTED_CSS_GRID_ATTRIBUTES_SELECTOR);

    Array.prototype.forEach.call(elementsToUpgradeStyles, element => {
      this.setCssGridStyles_(element);
    });
  }


  /**
   * Copies the whitelisted CSS grid styles for the <amp-story-grid-layer>
   * element itself.
   * @private
   */
  setOwnCssGridStyles_() {
    this.setCssGridStyles_(this.element);
  }


  /**
   * Copies the values of an element's attributes to its styles, if the
   * attributes/properties are in the whitelist.
   *
   * @param {!Element} element The element whose styles should be copied from
   *     its attributes.
   */
  setCssGridStyles_(element) {
    for (let i = element.attributes.length - 1; i >= 0; i--) {
      const attribute = element.attributes[i];
      const attributeName = attribute.name.toLowerCase();
      const propertyName = SUPPORTED_CSS_GRID_ATTRIBUTES[attributeName];
      if (propertyName) {
        element.style[propertyName] = attribute.value;
        element.removeAttribute(attributeName);
      }
    }
  }

  /** @override */
  isLayoutSupported(layout) {
    return layout == Layout.CONTAINER;
  }
}

AMP.registerElement('amp-story-grid-layer', AmpStoryGridLayer);
