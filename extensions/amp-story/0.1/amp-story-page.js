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
 * @fileoverview Embeds a story
 *
 * Example:
 * <code>
 * <amp-story-page>
 * </amp-story>
 * </code>
 */
import {
  AnimationManager,
  hasAnimations,
} from './animation';
import {Layout} from '../../../src/layout';
import {upgradeBackgroundAudio} from './audio';
import {EventType, dispatch, dispatchCustom} from './events';
import {AdvancementConfig} from './page-advancement';
import {scopedQuerySelectorAll} from '../../../src/dom';
import {getLogEntries} from './logging';
import {getMode} from '../../../src/mode';
import {CommonSignals} from '../../../src/common-signals';
import {setImportantStyles} from '../../../src/style';



/**
 * CSS class for an amp-story-page that indicates the entire page is loaded.
 * @const {string}
 */
const PAGE_LOADED_CLASS_NAME = 'i-amphtml-story-page-loaded';


/**
 * Selector for which media to wait for on page layout.
 * @const {string}
 */
const PAGE_MEDIA_SELECTOR = 'amp-audio, amp-video, amp-img, amp-anim';


/** @private @const {string} */
const TAG = 'amp-story-page';


/**
 * The <amp-story-page> custom element, which represents a single page of
 * an <amp-story>.
 */
export class AmpStoryPage extends AMP.BaseElement {
  /** @param {!AmpElement} element */
  constructor(element) {
    super(element);

    /** @private {?AnimationManager} */
    this.animationManager_ = null;

    /** @private @const {!AdvancementConfig} */
    this.advancement_ = AdvancementConfig.forPage(this);

    /** @private @const {!Promise} */
    this.mediaLayoutPromise_ = this.waitForMediaLayout_();

    /** @private @const {!Promise<!./media-pool.MediaPool>} */
    this.mediaPoolPromise_ = new Promise((resolve, reject) => {
      this.setMediaPool = mediaPool => {
        this.mediaLayoutPromise_
            .then(() => resolve(mediaPool))
            .catch(reject);
      };
    });
  }


  /*
   * @return {?./animation.AnimationManager}
   * @private
   */
  maybeCreateAnimationManager_() {
    if (!this.animationManager_) {
      if (!hasAnimations(this.element)) {
        return;
      }

      this.animationManager_ = AnimationManager.create(
          this.element, this.getAmpDoc(), this.getAmpDoc().getUrl());
    }
  }


  /** @override */
  buildCallback() {
    upgradeBackgroundAudio(this.element);
    this.markMediaElementsWithPreload_();
    this.maybeCreateAnimationManager_();
    this.advancement_.addPreviousListener(() => this.previous());
    this.advancement_
        .addAdvanceListener(() => this.next(/* opt_isAutomaticAdvance */ true));
    this.advancement_
        .addProgressListener(progress => this.emitProgress_(progress));
  }


  /**
   * Marks any AMP elements that represent media elements with preload="auto".
   * @private
   */
  markMediaElementsWithPreload_() {
    const mediaSet = scopedQuerySelectorAll(
        this.element, 'amp-audio, amp-video');
    Array.prototype.forEach.call(mediaSet, mediaItem => {
      mediaItem.setAttribute('preload', 'auto');
    });
  }


  /** @override */
  isLayoutSupported(layout) {
    return layout == Layout.CONTAINER;
  }


  /** @override */
  pauseCallback() {
    this.pageInactiveCallback_();
  }


  /** @override */
  resumeCallback() {
    this.pageActiveCallback_();
  }

  /** @override */
  layoutCallback() {
    this.muteAllMedia();

    return Promise.all([
      this.beforeVisible(),
      this.mediaPoolPromise_,
    ]);
  }

  /** @return {!Promise} */
  beforeVisible() {
    return this.maybeApplyFirstAnimationFrame();
  }

  /** @private */
  onPageVisible_() {
    this.markPageAsLoaded_();
    this.updateAudioIcon_();
    this.registerAllMedia_();
    this.playAllMedia_();
    this.maybeStartAnimations();
    this.reportDevModeErrors_();
  }


  /** @private */
  waitForMediaLayout_() {
    const mediaSet = scopedQuerySelectorAll(this.element, PAGE_MEDIA_SELECTOR);
    const mediaPromises = Array.prototype.map.call(mediaSet, mediaEl => {
      return mediaEl.signals().whenSignal(CommonSignals.LOAD_END);
    });

    return Promise.all(mediaPromises);
  }


  /** @private */
  markPageAsLoaded_() {
    this.element.classList.add(PAGE_LOADED_CLASS_NAME);
  }


  /** @private */
  updateAudioIcon_() {
    // Dispatch event to signal whether audio is playing.
    const eventType = this.hasAudio_() ?
        EventType.AUDIO_PLAYING : EventType.AUDIO_STOPPED;
    dispatch(this.element, eventType, /* opt_bubbles */ true);
  }


  /**
   * @return {boolean}
   * @private
   */
  hasAudio_() {
    return Array.prototype.some.call(this.getAllMedia_(), mediaEl => {
      if (!(mediaEl instanceof HTMLMediaElement)) {
        return false;
      }

      return mediaEl.mozHasAudio ||
          Boolean(mediaEl['webkitAudioDecodedByteCount']) ||
          Boolean(mediaEl.audioTracks && mediaEl.audioTracks.length);
    });
  }


  /** @override */
  prerenderAllowed() {
    return true;
  }


  /**
   * Gets all media elements on this page.
   * @return {!NodeList<!Element>}
   * @private
   */
  getAllMedia_() {
    return scopedQuerySelectorAll(this.element, 'audio, video');
  }


  /**
   * Applies the specified callback to each media element on the page, after the
   * media element is loaded.
   * @param {!function(!./media-pool.MediaPool, !Element)} callbackFn The
   *     callback to be applied to each media element.
   */
  forEachMediaElement_(callbackFn) {
    const mediaSet = this.getAllMedia_();
    this.mediaPoolPromise_.then(mediaPool => {
      Array.prototype.forEach.call(mediaSet, mediaEl => {
        callbackFn(mediaPool, mediaEl);
      });
    });
  }


  /**
   * Pauses all media on this page.
   * @param {boolean} opt_rewindToBeginning Whether to rewind the currentTime
   *     of media items to the beginning.
   * @private
   */
  pauseAllMedia_(opt_rewindToBeginning) {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.pause(/** @type {!HTMLMediaElement} */ (mediaEl),
          opt_rewindToBeginning);
    });
  }


  /**
   * Pauses all media on this page.
   * @private
   */
  playAllMedia_() {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.play(/** @type {!HTMLMediaElement} */ (mediaEl));
    });
  }


  /**
   * Pauses all media on this page.
   * @private
   */
  preloadAllMedia_() {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.preload(/** @type {!HTMLMediaElement} */ (mediaEl));
    });
  }


  /**
   * Mutes all media on this page.
   */
  muteAllMedia() {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.mute(/** @type {!HTMLMediaElement} */ (mediaEl));
    });
  }


  /**
   * Unmutes all media on this page.
   */
  unmuteAllMedia() {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.unmute(/** @type {!HTMLMediaElement} */ (mediaEl));
    });
  }


  /**
   * Registers all media on this page
   * @private
   */
  registerAllMedia_() {
    this.forEachMediaElement_((mediaPool, mediaEl) => {
      mediaPool.register(/** @type {!HTMLMediaElement} */ (mediaEl));
    });
  }


  /**
   * Starts playing animations, if the animation manager is available.
   */
  maybeStartAnimations() {
    if (!this.animationManager_) {
      return;
    }
    this.animationManager_.animateIn();
  }


  /**
   * @return {!Promise}
   */
  maybeApplyFirstAnimationFrame() {
    if (!this.animationManager_) {
      return Promise.resolve();
    }
    return this.animationManager_.applyFirstFrame();
  }


  /**
   * @param {boolean} isActive
   */
  setActive(isActive) {
    if (isActive) {
      this.element.setAttribute('active', '');
      this.pageActiveCallback_();
    } else {
      this.element.removeAttribute('active');
      this.pageInactiveCallback_();
    }
  }


  /** @private */
  pageActiveCallback_() {
    this.advancement_.start();
    this.onPageVisible_();
  }


  /** @private */
  pageInactiveCallback_() {
    this.pauseAllMedia_(/* opt_rewindToBeginning */ true);
    this.advancement_.stop();

    if (this.animationManager_) {
      this.animationManager_.cancelAll();
    }
  }


  /**
   * @return {number} The distance from the current page to the active page.
   */
  getDistance() {
    return parseInt(this.element.getAttribute('distance'), 10);
  }


  /**
   * @param {number} distance The distance from the current page to the active
   *     page.
   */
  setDistance(distance) {
    this.element.setAttribute('distance', distance);
    setImportantStyles(this.element, {
      transform: `translateY(${100 * distance}%)`,
    });

    this.registerAllMedia_();
    if (distance > 0 && distance <= 2) {
      this.preloadAllMedia_();
    }
  }


  /**
   * @param {!./media-pool.MediaPool} unusedMediaPool The media pool instance to
   *     use for this AmpStoryPage.
   */
  setMediaPool(unusedMediaPool) {
    // Overridden by this.mediaPoolPromise_.
  }

  /**
   * @return {boolean} Whether this page is currently active.
   */
  isActive() {
    return this.element.hasAttribute('active');
  }


  /**
   * Emits an event indicating that the progress of the current page has changed
   * to the specified value.
   * @param {number} progress The progress from 0.0 to 1.0.
   */
  emitProgress_(progress) {
    const payload = {
      pageId: this.element.id,
      progress,
    };
    const eventInit = {bubbles: true};
    dispatchCustom(this.win, this.element, EventType.PAGE_PROGRESS, payload,
        eventInit);
  }


  /**
   * Returns all of the pages that are one hop from this page.
   * @return {!Array<string>}
   */
  getAdjacentPageIds() {
    const adjacentPageIds = [];

    const autoAdvanceNext =
        this.getNextPageId_(true /* opt_isAutomaticAdvance */);
    const manualAdvanceNext =
        this.getNextPageId_(false /* opt_isAutomaticAdvance */);
    const previous = this.getPreviousPageId_();

    if (autoAdvanceNext) {
      adjacentPageIds.push(autoAdvanceNext);
    }

    if (manualAdvanceNext && manualAdvanceNext != autoAdvanceNext) {
      adjacentPageIds.push(manualAdvanceNext);
    }

    if (previous) {
      adjacentPageIds.push(previous);
    }

    return adjacentPageIds;
  }


  /**
   * Gets the ID of the previous page in the story (before the current page).
   * @return {?string} Returns the ID of the next page in the story, or null if
   *     there isn't one.
   * @private
   */
  getPreviousPageId_() {
    const previousElement = this.element.previousElementSibling;
    if (previousElement && previousElement.tagName.toLowerCase() === TAG) {
      return previousElement.id;
    }

    return null;
  }


  /**
   * Gets the ID of the next page in the story (after the current page).
   * @param {boolean=} opt_isAutomaticAdvance Whether this navigation was caused
   *     by an automatic advancement after a timeout.
   * @return {?string} Returns the ID of the next page in the story, or null if
   *     there isn't one.
   * @private
   */
  getNextPageId_(opt_isAutomaticAdvance) {
    if (opt_isAutomaticAdvance &&
        this.element.hasAttribute('auto-advance-to')) {
      return this.element.getAttribute('auto-advance-to');
    }

    if (this.element.hasAttribute('advance-to')) {
      return this.element.getAttribute('advance-to');
    }

    const nextElement = this.element.nextElementSibling;
    if (nextElement && nextElement.tagName.toLowerCase() === TAG) {
      return nextElement.id;
    }

    return null;
  }


  /**
   * Navigates to the previous page in the story.
   */
  previous() {
    const pageId = this.getPreviousPageId_();

    if (pageId === null) {
      dispatch(this.element, EventType.SHOW_NO_PREVIOUS_PAGE_HELP, true);
      return;
    }

    this.switchTo_(pageId);
  }


  /**
   * Navigates to the next page in the story.
   * @param {boolean} opt_isAutomaticAdvance Whether this navigation was caused
   *     by an automatic advancement after a timeout.
   */
  next(opt_isAutomaticAdvance) {
    this.switchTo_(
        this.getNextPageId_(opt_isAutomaticAdvance), 'i-amphtml-story-bookend');
  }


  /**
   * @param {?string} targetPageIdOrNull
   * @param {string=} opt_fallbackPageId
   * @private
   */
  switchTo_(targetPageIdOrNull, opt_fallbackPageId) {
    const targetPageId = targetPageIdOrNull || opt_fallbackPageId;
    if (!targetPageId) {
      return;
    }

    const payload = {targetPageId};
    const eventInit = {bubbles: true};
    dispatchCustom(this.win, this.element, EventType.SWITCH_PAGE, payload,
        eventInit);
  }


  /**
   * @private
   */
  reportDevModeErrors_() {
    if (!getMode().development) {
      return;
    }

    getLogEntries(this.element).then(logEntries => {
      dispatchCustom(this.win, this.element,
          EventType.DEV_LOG_ENTRIES_AVAILABLE, logEntries, {bubbles: true});
    });
  }
}

AMP.registerElement('amp-story-page', AmpStoryPage);
