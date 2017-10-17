/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2017 Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

'use strict';

// For content pages

if ( typeof vAPI === 'object' ) { // >>>>>>>> start of HUGE-IF-BLOCK

/******************************************************************************/
/******************************************************************************/

vAPI.DOMFilterer = function() {
    this.commitTimer = new vAPI.SafeAnimationFrame(this.commitNow.bind(this));
    this.domIsReady = document.readyState !== 'loading';
    this.hideNodeId = vAPI.randomToken();
    this.hideNodeStylesheet = false;
    this.excludedNodeSet = new WeakSet();
    this.addedCSSRules = [];
    this.removedCSSRules = [];
    this.internalRules = new Set();

    this.userStylesheets = {
        current: new Set(),
        added: new Set(),
        removed: new Set(),
        saved: undefined,
        disabled: false,
        apply: function() {
            var current = this.saved !== undefined ? this.saved : this.current;
            for ( let cssText of this.added ) {
                if ( current.has(cssText) || this.removed.has(cssText) ) {
                    this.added.delete(cssText);
                } else {
                    current.add(cssText);
                }
            }
            for ( let cssText of this.removed ) {
                if ( current.has(cssText) === false ) {
                    this.removed.delete(cssText);
                } else {
                    current.delete(cssText);
                }
            }
            if (
                this.disabled ||
                this.added.size === 0 && this.removed.size === 0
            ) {
                return;
            }
            vAPI.messaging.send('vapi-background', {
                what: 'userCSS',
                add: Array.from(this.added),
                remove: Array.from(this.removed)
            });
            this.added.clear();
            this.removed.clear();
        },
        add: function(cssText) {
            if ( cssText === '' ) { return; }
            this.added.add(cssText);
        },
        remove: function(cssText) {
            if ( cssText === '' ) { return; }
            this.removed.add(cssText);
        },
        toggle: function(state) {
            if ( state === undefined ) { state = this.disabled; }
            if ( state !== this.disabled ) { return; }
            this.disabled = !state;
            var toAdd = [], toRemove = [];
            if ( this.disabled ) {
                toRemove = Array.from(this.current);
                this.saved = this.current;
                this.current = undefined;
            } else {
                toAdd = Array.from(this.saved);
                this.current = this.saved;
                this.saved = undefined;
            }
            if ( toAdd.length === 0 && toRemove.length === 0 ) { return; }
            vAPI.messaging.send('vapi-background', {
                what: 'userCSS',
                add: toAdd,
                remove: toRemove
            });
        }
    };

    if ( this.domIsReady !== true ) {
        document.addEventListener('DOMContentLoaded', () => {
            this.domIsReady = true;
            this.commit();
        });
    }
};

vAPI.DOMFilterer.prototype = {
    reOnlySelectors: /\n\{[^\n]+/g,
    commitNow: function() {
        this.commitTimer.clear();

        var i, entry, ruleText;

        i = this.addedCSSRules.length;
        while ( i-- ) {
            entry = this.addedCSSRules[i];
            if ( entry.lazy !== true || this.domIsReady ) {
                ruleText = entry.selectors + '\n{ ' + entry.declarations + ' }';
                this.userStylesheets.add(ruleText);
                this.addedCSSRules.splice(i, 1);
                if ( entry.internal ) {
                    this.internalRules.add(ruleText);
                }
            }
        }
        i = this.removedCSSRules.length;
        while ( i-- ) {
            entry = this.removedCSSRules[i];
            ruleText = entry.selectors + '\n{ ' + entry.declarations + ' }';
            this.userStylesheets.remove(ruleText);
        }
        this.removedCSSRules = [];
        this.userStylesheets.apply();
    },

    commit: function(commitNow) {
        if ( commitNow ) {
            this.commitTimer.clear();
            this.commitNow();
        } else {
            this.commitTimer.start();
        }
    },

    addCSSRule: function(selectors, declarations, details) {
        if ( selectors === undefined ) { return; }

        var selectorsStr = Array.isArray(selectors)
                ? selectors.join(',\n')
                : selectors;
        if ( selectorsStr.length === 0 ) { return; }
        this.addedCSSRules.push({
            selectors: selectorsStr,
            declarations,
            lazy: details && details.lazy === true,
            internal: details && details.internal === true
        });
    },

    removeCSSRule: function(selectors, declarations) {
        var selectorsStr = Array.isArray(selectors)
                ? selectors.join(',\n')
                : selectors;
        if ( selectorsStr.length === 0 ) { return; }
        this.removedCSSRules.push({
            selectors: selectorsStr,
            declarations,
        });
    },

    excludeNode: function(node) {
        this.excludedNodeSet.add(node);
        this.unhideNode(node);
    },

    hideNode: function(node) {
        if ( this.excludedNodeSet.has(node) ) { return; }
        node.setAttribute(this.hideNodeId, '');
        if ( this.hideNodeStylesheet === false ) {
            this.hideNodeStylesheet = true;
            this.addCSSRule(
                '[' + this.hideNodeId + ']',
                'display: none !important;',
                { internal: true }
            );
        }
    },

    unhideNode: function(node) {
        node.removeAttribute(this.hideNodeId);
    },

    toggle: function(state) {
        this.userStylesheets.toggle(state);
    },

    getFilteredElementCount: function() {
        return document.querySelectorAll(this.getAllDeclarativeSelectors()).length;
    },

    // TODO: remove CSS pseudo-classes which are incompatible with
    //       static profile.
    getAllDeclarativeSelectors: function() {
        let selectors = [];
        for ( var sheet of this.userStylesheets.current ) {
            if ( this.internalRules.has(sheet) ) { continue; }
            selectors.push(sheet.replace(this.reOnlySelectors, ',').trim().slice(0, -1));
        }
        return selectors.join(',\n');
    }

    // TODO: support for internal CSS stylesheets (for element picker, etc.)
};

/******************************************************************************/
/******************************************************************************/

} // <<<<<<<< end of HUGE-IF-BLOCK
