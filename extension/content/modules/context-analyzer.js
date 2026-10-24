window.KarenContextAnalyzer = {
  getParentChainContext(element, maxDepth = 3) {
    const parentChain = [];
    let current = element.parentElement;
    let depth = 0;
    
    while (current && depth < maxDepth && current.tagName !== 'BODY') {
      const parentInfo = {
        tag: current.tagName.toLowerCase(),
        classes: Array.from(current.classList),
        id: current.id || null,
        role: current.getAttribute('role') || null,
        text_sample: current.textContent.substring(0, 50).trim()
      };
      
      // Only include meaningful parents (not just divs without context)
      if (parentInfo.classes.length > 0 || parentInfo.id || parentInfo.role || 
          ['nav', 'header', 'footer', 'main', 'section', 'article', 'aside'].includes(parentInfo.tag)) {
        parentChain.push(parentInfo);
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return parentChain.length > 0 ? parentChain : null;
  },

  isValidComponentFile(filePath) {
    if (!filePath) return false;
    
    // Check if it's in a component directory
    const isInComponentDir = filePath.includes('component') || filePath.includes('/ui/');
    
    // Check if it's NOT a page/layout/route file (Next.js, Remix, etc.)
    const isPageFile = /\/(page|layout|route|error|loading|not-found|template|_app|_document)\./.test(filePath);
    
    // Must be in component directory and not a page file
    // (Naming convention doesn't matter - both PascalCase and kebab-case are valid)
    return isInComponentDir && !isPageFile;
  },

  /**
   * Extract source information from element
   * Tries multiple framework-specific detection strategies
   */
  extractSourceInfo(element) {
    let sourceInfo = {
      filePath: null,
      lineRange: null,
      hasSourceMap: false
    };

    // Try React fiber detection first (most reliable for React/Next.js)
    try {
      const reactInfo = this.getReactFiberInfo(element);
      if (reactInfo && this.isValidComponentFile(reactInfo.filePath)) {
        sourceInfo = { ...sourceInfo, ...reactInfo };
      }
    } catch (error) {
      // Continue with fallback methods
    }

    // Try Vue detection
    if (!sourceInfo.filePath) {
      try {
        const vueInfo = this.getVueComponentInfo(element);
        if (vueInfo && this.isValidComponentFile(vueInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...vueInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try Svelte detection
    if (!sourceInfo.filePath) {
      try {
        const svelteInfo = this.getSvelteComponentInfo(element);
        if (svelteInfo && this.isValidComponentFile(svelteInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...svelteInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try Angular detection
    if (!sourceInfo.filePath) {
      try {
        const angularInfo = this.getAngularComponentInfo(element);
        if (angularInfo && this.isValidComponentFile(angularInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...angularInfo };
        }
      } catch (error) {
        // Continue with fallback methods
      }
    }

    // Try data attribute detection (generic fallback)
    if (!sourceInfo.filePath) {
      try {
        const dataInfo = this.getDataAttributeInfo(element);
        if (dataInfo && this.isValidComponentFile(dataInfo.filePath)) {
          sourceInfo = { ...sourceInfo, ...dataInfo };
        }
      } catch (error) {
        // Continue with empty source info
      }
    }

    return sourceInfo;
  },

  /**
   * Get React Fiber source info (works in development mode)
   */
  getReactFiberInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for React fiber keys
      const allKeys = Object.keys(current);
      const fiberKey = allKeys.find(key => 
        key.startsWith('__reactFiber') || 
        key.startsWith('__reactInternalInstance') ||
        key.startsWith('_reactInternalFiber')
      );
      
      if (fiberKey) {
        const fiber = current[fiberKey];
        
        if (fiber) {
          // Walk up the fiber tree to find source info
          let fiberNode = fiber;
          let fiberDepth = 0;
          const maxFiberDepth = 20;
          
          while (fiberNode && fiberDepth < maxFiberDepth) {
            // Check for source information in various locations
            const source = fiberNode._debugSource || 
                          fiberNode._source ||
                          fiberNode.elementType?._source ||
                          fiberNode.type?._source;
            
            if (source && source.fileName) {
              return {
                filePath: this.normalizeSourcePath(source.fileName),
                lineRange: source.lineNumber ? `${source.lineNumber}-${source.lineNumber + 10}` : null,
                hasSourceMap: true
              };
            }

            // Try alternate location for Next.js
            if (fiberNode._debugOwner) {
              const ownerSource = fiberNode._debugOwner._debugSource || 
                                 fiberNode._debugOwner._source;
              if (ownerSource && ownerSource.fileName) {
                return {
                  filePath: this.normalizeSourcePath(ownerSource.fileName),
                  lineRange: ownerSource.lineNumber ? `${ownerSource.lineNumber}-${ownerSource.lineNumber + 10}` : null,
                  hasSourceMap: true
                };
              }
            }

            // Move up the fiber tree
            fiberNode = fiberNode.return || fiberNode._debugOwner;
            fiberDepth++;
          }
        }
      }

      // Move up the DOM tree
      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Vue component info (works in development mode)
   */
  getVueComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Vue 3 instance
      const allKeys = Object.keys(current);
      const vueKey = allKeys.find(key => 
        key.startsWith('__vueParentComponent') || 
        key.startsWith('__vnode') ||
        key.startsWith('__vue_app__')
      );
      
      if (vueKey) {
        const vueInstance = current[vueKey];
        
        if (vueInstance) {
          // Try to get component info from various Vue 3 internals
          let componentInfo = vueInstance.type || vueInstance.component || vueInstance;
          
          // Check for __file property (added by Vue compiler in dev mode)
          if (componentInfo && componentInfo.__file) {
            return {
              filePath: this.normalizeSourcePath(componentInfo.__file),
              lineRange: null,
              hasSourceMap: true
            };
          }
          
          // Check parent component chain
          let parent = vueInstance.parent;
          let parentDepth = 0;
          while (parent && parentDepth < 10) {
            if (parent.type && parent.type.__file) {
              return {
                filePath: this.normalizeSourcePath(parent.type.__file),
                lineRange: null,
                hasSourceMap: true
              };
            }
            parent = parent.parent;
            parentDepth++;
          }
        }
      }
      
      // Check for Vue 2 instance
      if (current.__vue__) {
        const vue2Instance = current.__vue__;
        if (vue2Instance.$options && vue2Instance.$options.__file) {
          return {
            filePath: this.normalizeSourcePath(vue2Instance.$options.__file),
            lineRange: null,
            hasSourceMap: true
          };
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Svelte component info (works in development mode)
   */
  getSvelteComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Svelte component metadata
      const allKeys = Object.keys(current);
      const svelteKey = allKeys.find(key => 
        key.startsWith('__svelte_meta') || 
        key.startsWith('__svelte')
      );
      
      if (svelteKey) {
        const svelteData = current[svelteKey];
        
        // Svelte dev mode can expose component file info
        if (svelteData && svelteData.loc) {
          return {
            filePath: this.normalizeSourcePath(svelteData.loc.file || svelteData.loc.source),
            lineRange: svelteData.loc.line ? `${svelteData.loc.line}-${svelteData.loc.line + 10}` : null,
            hasSourceMap: true
          };
        }
        
        if (svelteData && svelteData.file) {
          return {
            filePath: this.normalizeSourcePath(svelteData.file),
            lineRange: null,
            hasSourceMap: true
          };
        }
      }
      
      // Check for Svelte scoped attribute which might contain component info
      const dataAttr = current.getAttribute('data-svelte-h') || current.getAttribute('data-s-');
      if (dataAttr) {
        // Try to find component info from class names (Svelte uses scoped CSS)
        const classes = Array.from(current.classList);
        const svelteClass = classes.find(cls => cls.startsWith('svelte-'));
        
        // Check if there's a global Svelte registry with component info
        if (window.__SVELTE_DEVTOOLS_GLOBAL_HOOK__) {
          try {
            const hook = window.__SVELTE_DEVTOOLS_GLOBAL_HOOK__;
            if (hook.components) {
              // Try to find component that matches this element
              for (const [id, component] of hook.components.entries()) {
                if (component && component.detail && component.detail.$$) {
                  const svelteInternal = component.detail.$$;
                  if (svelteInternal.file) {
                    return {
                      filePath: this.normalizeSourcePath(svelteInternal.file),
                      lineRange: null,
                      hasSourceMap: true
                    };
                  }
                }
              }
            }
          } catch (error) {
            // Continue if devtools hook fails
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get Angular component info (works in development mode)
   */
  getAngularComponentInfo(element) {
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for Angular context (Ivy renderer)
      const allKeys = Object.keys(current);
      const ngKey = allKeys.find(key => 
        key.startsWith('__ngContext__') || 
        key.startsWith('__ng_debug__')
      );
      
      if (ngKey) {
        const ngContext = current[ngKey];
        
        if (ngContext) {
          // Try to extract component info from Angular's debug context
          let componentDef = null;
          
          // Angular Ivy stores component metadata
          if (Array.isArray(ngContext)) {
            // Context is an array, look for component definition
            for (const item of ngContext) {
              if (item && typeof item === 'object') {
                if (item.type && item.type.ɵcmp) {
                  componentDef = item.type.ɵcmp;
                  break;
                }
                if (item.component) {
                  componentDef = item.component;
                  break;
                }
              }
            }
          } else if (ngContext.component) {
            componentDef = ngContext.component;
          }
          
          // Check if component definition has file info
          if (componentDef) {
            // Angular dev mode sometimes exposes __NG_ELEMENT_ID__ or source info
            if (componentDef.__file) {
              return {
                filePath: this.normalizeSourcePath(componentDef.__file),
                lineRange: null,
                hasSourceMap: true
              };
            }
            
            // Try to get info from constructor name and project structure
            if (componentDef.constructor && componentDef.constructor.name) {
              const componentName = componentDef.constructor.name;
              // Angular convention: ButtonComponent -> button.component.ts
              if (componentName.endsWith('Component')) {
                const fileName = componentName
                  .replace(/Component$/, '')
                  .replace(/([A-Z])/g, (match, p1, offset) => offset > 0 ? '-' + p1.toLowerCase() : p1.toLowerCase());
                return {
                  filePath: `components/${fileName}.component.ts`,
                  lineRange: null,
                  hasSourceMap: false // This is inferred, not from source maps
                };
              }
            }
          }
        }
      }
      
      // Check for Angular attribute directives
      const ngComponent = current.getAttribute('ng-version');
      if (ngComponent && window.ng && window.ng.probe) {
        try {
          const debugElement = window.ng.probe(current);
          if (debugElement && debugElement.componentInstance) {
            const instance = debugElement.componentInstance;
            const constructor = instance.constructor;
            if (constructor && constructor.name && constructor.name.endsWith('Component')) {
              const componentName = constructor.name;
              const fileName = componentName
                .replace(/Component$/, '')
                .replace(/([A-Z])/g, (match, p1, offset) => offset > 0 ? '-' + p1.toLowerCase() : p1.toLowerCase());
              return {
                filePath: `components/${fileName}.component.ts`,
                lineRange: null,
                hasSourceMap: false // This is inferred
              };
            }
          }
        } catch (error) {
          // ng.probe might not be available
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Get data attribute source info (generic fallback)
   */
  getDataAttributeInfo(element) {
    let current = element;
    const maxDepth = 5;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check ALL data attributes for file path patterns
      const allAttributes = current.attributes;
      for (let i = 0; i < allAttributes.length; i++) {
        const attr = allAttributes[i];
        
        // Look for any data-* attribute that contains a file path pattern
        if (attr.name.startsWith('data-') && attr.value) {
          // Check if value looks like a file path with component indicators
          // Patterns: "path/to/file.tsx:15:5:span" or "components/Button.jsx" etc.
          const filePathPattern = /([a-zA-Z0-9_\-\/\.]+\.(tsx?|jsx?|vue|svelte))(?::(\d+))?/;
          const match = attr.value.match(filePathPattern);
          
          if (match) {
            const filePath = match[1];
            const lineNumber = match[3];
            
            return {
              filePath: this.normalizeSourcePath(filePath),
              lineRange: lineNumber ? `${lineNumber}-${parseInt(lineNumber) + 10}` : null,
              hasSourceMap: true
            };
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  },

  /**
   * Normalize source file path
   */
  normalizeSourcePath(filePath) {
    // Remove common prefixes and normalize path
    let normalized = filePath
      // Remove build tool prefixes
      .replace(/^\[project\]\//, '')
      .replace(/^\[turbopack\]\//, '')
      .replace(/^\[next\]\//, '')
      .replace(/^webpack:\/\/\//, '')
      .replace(/^vite:\/\/\//, '')
      // Next.js App Router patterns (preserve full path for clarity)
      .replace(/^.*\/(app\/.*?)$/, '$1')
      // React/SPA patterns
      .replace(/^.*\/src\//, 'src/')
      .replace(/^.*\/components\//, 'components/')
      .replace(/^.*\/pages\//, 'pages/')
      // Vue patterns
      .replace(/^.*\/views\//, 'views/')
      // Angular patterns  
      .replace(/^.*\/app\//, 'app/')
      // Svelte patterns
      .replace(/^.*\/routes\//, 'routes/')
      .replace(/^.*\/lib\//, 'lib/')
      // Rails patterns
      .replace(/^.*\/app\/views\//, 'app/views/')
      .replace(/^.*\/app\/assets\//, 'app/assets/')
      .replace(/^.*\/app\/controllers\//, 'app/controllers/')
      .replace(/^.*\/app\/models\//, 'app/models/')
      .replace(/^.*\/app\/helpers\//, 'app/helpers/')
      // Django patterns
      .replace(/^.*\/templates\//, 'templates/')
      .replace(/^.*\/static\//, 'static/')
      // General web patterns
      .replace(/^.*\/public\//, 'public/')
      .replace(/^.*\/assets\//, 'assets/')
      .replace(/^.*\/js\//, 'js/')
      .replace(/^.*\/css\//, 'css/')
      .replace(/^.*\/scss\//, 'scss/')
      .replace(/^.*\/styles\//, 'styles/')
      // Remove query parameters and hash
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '');
    
    // For Next.js app directory, ensure we preserve the app/ prefix
    if (!normalized.startsWith('app/') && normalized.includes('/app/')) {
      normalized = 'app/' + normalized.split('/app/')[1];
    }
    
    return normalized;
  },

};
