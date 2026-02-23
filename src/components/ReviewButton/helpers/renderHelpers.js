/**
 * Main function to render leaves into HTML
 */
export function renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, rootInstance, invalidFields = new Set(), invalidComponents = new Set()) {
  const sortedLeaves = [...leaves].sort((a, b) => {
    const isPanelA = a.comp?.component?.type === 'panel' || a.comp?.type === 'panel';
    const isPanelB = b.comp?.component?.type === 'panel' || b.comp?.type === 'panel';
    const isWellA = a.comp?.component?.type === 'well' || a.comp?.type === 'well';
    const isWellB = b.comp?.component?.type === 'well' || b.comp?.type === 'well';

    const isFlattenedA = shouldFlattenContainer([a.comp?.type, a.comp?.component?.type]);
    const isFlattenedB = shouldFlattenContainer([b.comp?.type, b.comp?.component?.type]);

    const isContainerA = (isPanelA || isWellA) && !isFlattenedA;
    const isContainerB = (isPanelB || isWellB) && !isFlattenedB;

    if (isContainerA && !isContainerB) {
      return -1;
    }
    if (!isContainerA && isContainerB) {
      return 1;
    }

    const isTagpadA = a.comp?.component?.type === 'tagpad' || a.comp?.type === 'tagpad' ||
      a.path?.includes('tagpad') || a.label?.startsWith('Tag ');
    const isTagpadB = b.comp?.component?.type === 'tagpad' || b.comp?.type === 'tagpad' ||
      b.path?.includes('tagpad') || b.label?.startsWith('Tag ');

    if (isTagpadA && !isTagpadB) {
      return a.formIndex >= 0 ? -1 : 0;
    }
    if (!isTagpadA && isTagpadB) {
      return b.formIndex >= 0 ? 1 : 0;
    }

    if (a.formIndex >= 0 && b.formIndex >= 0) {
      return a.formIndex - b.formIndex;
    }
    if (a.formIndex >= 0) return -1;
    if (b.formIndex >= 0) return 1;

    if (a.path && b.path) {
      const aDepth = (a.path.match(/\./g) || []).length;
      const bDepth = (b.path.match(/\./g) || []).length;

      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }

      return a.path.localeCompare(b.path);
    }

    return 0;
  });

  // Reset root on each render to prevent duplicate rows on subsequent loads
  const root = {};
  const ensureNode = (obj, k, compRef) => {
    if (obj == null) {
      return {
        __children: {}, __rows: {}, __label: null, __suppress: false,
        __kind: null, __colKeys: null, __colLabels: null,
        __formIndex: -1,
        __comp: compRef || undefined
      };
    }
    if (typeof k !== 'string' && typeof k !== 'number') {
      k = String(k || 'unknown');
    }
    if (!obj[k]) {
      obj[k] = {
        __children: {}, __rows: {}, __label: null, __suppress: false,
        __kind: null, __colKeys: null, __colLabels: null,
        __formIndex: -1,
        __comp: compRef || undefined
      };
    } else if (compRef && !obj[k].__comp) {
      obj[k].__comp = compRef;
    }
    return obj[k];
  };

  function setNodeLabelForPath(node, containerPath) {
    if (!node.__label && labelByPath && typeof labelByPath === 'object' && containerPath in labelByPath) {
      node.__label = labelByPath[containerPath];
    }
  }

  function setNodeMetaForPath(node, containerPath) {
    const m = metaByPath && metaByPath[containerPath];
    if (containerPath.includes('editGrid') || containerPath.includes('dataGrid') || containerPath.includes('dataTable')) {
    }
    if (m) {
      if (!node.__kind) {
        node.__kind = m.kind;
      }
      if (m.kind === 'editgrid' || m.kind === 'datagrid' || m.kind === 'datatable') {
        node.__colKeys = m.columnKeys || [];
        node.__colLabels = m.columnLabels || [];
      }
    }
  }

  function setNodeIndexForPath(node, containerPath) {
    if (indexByPath && typeof indexByPath === 'object' && containerPath in indexByPath) {
      node.__formIndex = indexByPath[containerPath];
    }
  }

  // Reset processed paths on each render to prevent duplicates
  // Use a fresh Set on each call to ensure no state persists between modal opens
  const processedTreePaths = new Set();
  
  // Track which row paths have been processed to prevent duplicate row structures
  const processedRowPaths = new Set();

  const isParentComponent = (comp) => {
    return isContainerType([comp?.type, comp?.component?.type], ['table']) &&
           !shouldFlattenContainer([comp?.type, comp?.component?.type])
  };

  const panelPaths = new Set();
  for (const { path, comp } of sortedLeaves) {
    if (isParentComponent(comp)) {
      const normalizedPath = path.replace(/\.data\./g, '.')
        .replace(/^data\./, '')
        .replace(/^form\./, '')
        .replace(/^submission\./, '');
      panelPaths.add(normalizedPath);
    }
  }

  for (const { path, label, value, comp, formIndex } of sortedLeaves) {
    // Normalize path: remove duplicate form names, data segments, etc.
    let normalizedPath = path.replace(/\.data\./g, '.')
      .replace(/^data\./, '')
      .replace(/^form\./, '')
      .replace(/^submission\./, '');
    
    // Remove duplicate form names (e.g., hardwareForm.hardwareForm -> hardwareForm)
    normalizedPath = normalizedPath.replace(/^([^.]+)\.\1(\.|$)/, '$1$2');
    
    // Remove intermediate panel segments for matching purposes
    // e.g., hardwareForm.data.dataGrid[0].panel.panel1.picOfSn4 -> hardwareForm.data.dataGrid[0].picOfSn4
    const pathForMatching = normalizedPath.replace(/\.panel[^.]*\./g, '.').replace(/\.panel[^.]*$/, '');
    
    // Check both the full normalized path and the simplified path for matching
    if (processedTreePaths.has(normalizedPath) || processedTreePaths.has(pathForMatching)) {
      continue;
    }

    const isPanelComponent = isParentComponent(comp);
    if (isPanelComponent) {
      panelPaths.add(normalizedPath);
      panelPaths.add(pathForMatching);
    }

    // Add both the full path and simplified path to prevent duplicates
    processedTreePaths.add(normalizedPath);
    processedTreePaths.add(pathForMatching);

    let isChildOfPanel = false;
    let parentPanelPath = '';

    if (!isPanelComponent) {
      for (const panelPath of panelPaths) {
        if (normalizedPath !== panelPath &&
          normalizedPath.startsWith(panelPath + '.')) {
          isChildOfPanel = true;
          parentPanelPath = panelPath;
          break;
        }
      }
    }

    const parts = normalizedPath
      .split('.')
      .filter(Boolean)
      .filter(seg => !/^\d+$/.test(seg));
    
    let ptr = root;
    let containerPath = '';

    // Track if we're inside a datagrid row (have seen array notation)
    let isInsideDatagridRowContext = false;
    
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!seg) {
        continue;
      }

      const idxMatch = seg.match(/\[(\d+)\]/);
      const key = seg.replace(/\[\d+\]/g, '');

      if (!key) {
        continue;
      }

      // Check if we've seen array notation earlier - if so, we're inside a datagrid row
      if (idxMatch) {
        isInsideDatagridRowContext = true;
      }

      containerPath = containerPath ? `${containerPath}.${key}` : key;

      try {
        const node = ensureNode(ptr, key, comp);

        if (!node) {
          continue;
        }

        if (suppressLabelForKey.has(key)) node.__suppress = true;
        setNodeLabelForPath(node, containerPath);
        setNodeMetaForPath(node, containerPath);
        setNodeIndexForPath(node, containerPath);
        if (formIndex >= 0 && (node.__formIndex === -1 || formIndex < node.__formIndex)) {
          node.__formIndex = formIndex;
        }

        if (idxMatch) {
          const idx = Number(idxMatch[1]);
          // Check if we're inside a panel/well that's nested in a datagrid row
          // If so, don't create rows - use children instead
          const isPanelOrWellNode = node.__comp?.component?.type === 'panel' || node.__comp?.type === 'panel' ||
                                    node.__comp?.component?.type === 'well' || node.__comp?.type === 'well' ||
                                    comp?.component?.type === 'panel' || comp?.type === 'panel' ||
                                    comp?.component?.type === 'well' || comp?.type === 'well';
          
          // Create a unique path key to prevent duplicate processing
          const rowPathKey = `${containerPath}[${idx}]`;
          
          // CRITICAL: If we've seen array notation earlier in the path, we're inside a datagrid row
          // In that case, panels/wells should NEVER create rows - always use __children
          // Also check if the current key is "panel" or "well" - these should never create rows when inside datagrid
          const isPanelOrWellKey = key === 'panel' || key === 'well' || 
                                   key.includes('panel') || key.includes('well');
          
          // ALWAYS prevent panels/wells from creating rows when inside datagrid context
          if ((isPanelOrWellNode || isPanelOrWellKey) && isInsideDatagridRowContext) {
            // Use __children instead of __rows for panels inside datagrid rows
            // This prevents duplicate "Row 1:" labels
            if (!node.__children) node.__children = {};
            // For panels/wells inside datagrid rows, don't use array notation - just use the key directly
            // This ensures panels are treated as direct children, not as rows
            if (!node.__children[key]) {
              node.__children[key] = { 
                __children: {}, 
                __rows: {}, // Always empty - make it non-writable
                __comp: comp 
              };
              // Make __rows non-writable to prevent any row structure from being created
              Object.defineProperty(node.__children[key], '__rows', {
                value: {},
                writable: false,
                enumerable: true,
                configurable: false
              });
            }
            ptr = node.__children[key].__children;
          } else {
            // Only create rows for actual datagrid rows, not for panels/wells
            // Only create rows if we haven't processed this path before
            // This prevents duplicate row structures on subsequent modal opens
            if (!processedRowPaths.has(rowPathKey)) {
              processedRowPaths.add(rowPathKey);
              if (!node.__rows) node.__rows = {};
              node.__rows[idx] ??= { __children: {}, __comp: comp };
            }
            ptr = node.__rows[idx]?.__children || {};
          }
        } else if (i === parts.length - 1) {
          const isWellComponent = comp?.component?.type === 'well' || comp?.type === 'well';

          if (isPanelComponent || isWellComponent) {
            // If inside a datagrid row context, NEVER create __rows structure - only use __children
            // This prevents panels from creating duplicate "Row 1:" labels
            const panelNode = {
              __leaf: false,
              __label: label || key,
              __value: value,
              __comp: comp,
              __formIndex: formIndex,
              __children: {},
              __rows: {}, // Always empty for panels inside datagrid rows
              __suppress: false,
              __kind: comp.type,
              __colKeys: null,
              __colLabels: null
            };
            // If inside datagrid row context, ensure __rows stays empty and never gets populated
            if (isInsideDatagridRowContext) {
              // Prevent any row structure from being created - make it non-writable
              Object.defineProperty(panelNode, '__rows', {
                value: {},
                writable: false,
                enumerable: true,
                configurable: false
              });
            }
            ptr[key] = panelNode;
          } else {
            let labelData = label || key
            if(comp?.parent?.type === 'datamap') {
              labelData = key;
            }
            ptr[key] = {
              __leaf: true,
              __label: labelData,
              __value: value,
              __kind: comp.type,
              __comp: comp,
              __formIndex: formIndex
            };
          }
        } else {
          // For intermediate segments (not the last one, and no array notation)
          // If we're inside a datagrid row context and this is a panel/well, ensure it uses __children
          const isPanelOrWellKey = key === 'panel' || key === 'well' || 
                                   key.includes('panel') || key.includes('well');
          const isPanelOrWellComp = comp?.component?.type === 'panel' || comp?.type === 'panel' ||
                                    comp?.component?.type === 'well' || comp?.type === 'well';
          
          if (isInsideDatagridRowContext && (isPanelOrWellKey || isPanelOrWellComp)) {
            // Inside datagrid row, panels/wells should always use __children, never __rows
            if (!node.__children) node.__children = {};
            if (!node.__children[key]) {
              node.__children[key] = {
                __children: {},
                __rows: {}, // Always empty for panels inside datagrid rows
                __comp: comp,
                __label: null,
                __suppress: false,
                __kind: comp?.type,
                __formIndex: -1
              };
              // Make __rows non-writable to prevent accidental population
              Object.defineProperty(node.__children[key], '__rows', {
                value: {},
                writable: false,
                enumerable: true,
                configurable: false
              });
            }
            ptr = node.__children[key].__children;
          } else {
            if (!node.__children) node.__children = {};
            Object.keys(node.__children).forEach(childKey => {
              if (node.__children[childKey] && !node.__children[childKey].__comp) {
                node.__children[childKey].__comp = comp;
              }
            });
            ptr = node.__children;
          }
        }
        if ((comp?.component?.type === 'datamap' || comp?.parent.type === 'datamap')) {
          if(ptr && ptr[key] && ptr[key].__comp) {
            ptr[key].__comp = comp;
            if (ptr[key].__children && typeof ptr[key].__children === 'object') {
              Object.keys(ptr[key].__children).forEach(childKey => {
                if (ptr[key].__children[childKey] && !ptr[key].__children[childKey].__comp) {
                  ptr[key].__children[childKey].__comp = comp;
                }
              });
            }
          }
        }
          
      } catch (error) {
        continue;
      }
    }
  }

  function renderNode(node, depth = 0, rootInstance = null, invalidFields = new Set(), basePath = '', invalidComponents = new Set(), isInsideDatagridRow = false) {
    let pad = `padding-left:10px; border-left:1px dotted #ccc;`;

    const sortedEntries = Object.entries(node).sort((a, b) => {
      const aIsTagpad = a[1]?.__label === 'Tagpad' || a[1]?.__comp?.component?.type === 'tagpad';
      const bIsTagpad = b[1]?.__label === 'Tagpad' || b[1]?.__comp?.component?.type === 'tagpad';

      if (aIsTagpad && bIsTagpad) {
        return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
      }

      if (aIsTagpad) return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? 0);
      if (bIsTagpad) return (a[1]?.__formIndex ?? 0) - (b[1]?.__formIndex ?? -1);

      return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
    });

    return sortedEntries.map(([k, v], index) => {
      const isAddressComponentRender = v.__comp?.component?.type === 'address' || v.__comp?.type === 'address';
      
      // Check if component is invalid FIRST - if invalid, always show it regardless of visibility
      // Use the component's actual path, not just the key, for better matching
      // Trim trailing spaces from keys
      const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
      const compPath = trimKey(v.__comp?.path || v.__comp?.key || v.__comp?.component?.key || '');
      const compKey = trimKey(v.__comp?.key || v.__comp?.component?.key || '');
      const fullPath = basePath ? `${basePath}.${trimKey(k)}` : trimKey(k);
      
      // Check multiple path variations and component reference
      const isInvalidByPath = isFieldInvalid(v.__comp, compPath, invalidFields);
      const isInvalidByFullPath = isFieldInvalid(v.__comp, fullPath, invalidFields);
      const isInvalidByKey = isFieldInvalid(v.__comp, k, invalidFields);
      const isInvalidByComponent = invalidComponents.has(v.__comp);
      const isInvalidByCompKey = compKey && invalidFields.has(compKey);
      const isInvalidByCompPath = compPath && invalidFields.has(compPath);
      
      const isInvalid = isInvalidByPath || isInvalidByFullPath || isInvalidByKey || 
                        isInvalidByComponent || isInvalidByCompKey || isInvalidByCompPath;
      
      // Debug logging for picOfSn components
      if (compKey && (compKey.includes('picOfSn') || compPath?.includes('picOfSn'))) {
        console.log(`[renderNode] Checking ${compKey}:`, {
          k,
          compPath,
          compKey,
          fullPath,
          basePath,
          isInvalidByPath,
          isInvalidByFullPath,
          isInvalidByKey,
          isInvalidByComponent,
          isInvalidByCompKey,
          isInvalidByCompPath,
          isInvalid,
          invalidFields: Array.from(invalidFields),
          inInvalidComponents: invalidComponents.has(v.__comp),
          compRef: v.__comp
        });
      }
      
      // If component is invalid, skip all visibility checks and show it
      if (!isInvalid) {
        if (v.__comp?._visible == false || v.__comp?.type === 'datasource') {
          return '';
        }
        
        if (v.__comp?.component?.hidden === true || v.__comp?.hidden === true) {
          return '';
        }
        
        if (v.__comp?.disabled === true || v.__comp?.component?.disabled === true) {
          if (v.__comp?.component?.reviewVisible !== true) {
            return '';
          }
        }
        
        const isRequired = v.__comp?.component?.validate?.required === true;
        const isReviewVisible = v.__comp?.component?.reviewVisible === true;
        
        if (isRequired && !isReviewVisible) {
          return '';
        }
        
        if (!isRequired && !isReviewVisible && !isAddressComponentRender) {
          return '';
        }
      }

      if (v.__comp?.parent?.type === 'datamap') {
        if (index === 0) {
          delete v.__comp;
        } else if (v?.__rows) {
          v.__children = {};
          Object.values(v.__rows).forEach(row => {
            if (row?.__children) {
              Object.entries(row.__children).forEach(([childKey, childVal]) => {
                v.__children[childVal.__label] = childKey;
              });
            }
          });
          v.__rows = {};
        }
      }

      if (/^\d+\]$/.test(k) || v?.__comp == undefined) {
        return v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath, invalidComponents, isInsideDatagridRow) : '';
      }

      if (v && v.__leaf) {
        // For leaf nodes, check if the component's actual path matches an invalid field
        // The leaf path might have extra segments (like .panel.panel1.) that aren't in the invalid field path
        // Check the component's actual path, the rendered key, and also check by component key
        // Trim trailing spaces from keys
        const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
        const compPath = trimKey(v.__comp?.path || v.__comp?.key || v.__comp?.component?.key || '');
        const compKey = trimKey(v.__comp?.key || v.__comp?.component?.key || '');
        
        // Check multiple path variations
        const isInvalidByPath = isFieldInvalid(v.__comp, compPath, invalidFields) ||
                                isFieldInvalid(v.__comp, k, invalidFields) ||
                                isFieldInvalid(v.__comp, basePath ? `${basePath}.${k}` : k, invalidFields) ||
                                invalidComponents.has(v.__comp) ||
                                (compKey && invalidFields.has(compKey)) ||
                                (compPath && invalidFields.has(compPath));
        
        // Always render leaf nodes - visibility is handled in renderLeafNode
        return renderLeafNode(v, k, depth, basePath, invalidFields, invalidComponents);
      }

      if (v && typeof v === 'object') {
        // If we're inside a datagrid row and this container has rows, flatten it
        // Also check if this is a panel/container that shouldn't create row labels
        if (isInsideDatagridRow && v.__rows && Object.keys(v.__rows).length > 0) {
          // Flatten the rows - render children directly without row labels
          const flattenedContent = Object.entries(v.__rows).map(([i, r]) => {
            const hasChildren = r.__children && Object.keys(r.__children).length;
            return hasChildren
              ? renderNode(r.__children, depth, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`, invalidComponents, true)
              : '';
          }).join('');
          return flattenedContent;
        }
        // If inside datagrid row and container has children but no rows, render children directly
        if (isInsideDatagridRow && v.__children && Object.keys(v.__children).length > 0 && (!v.__rows || Object.keys(v.__rows).length === 0)) {
          return renderNode(v.__children, depth, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents, true);
        }
        return renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents);
      }
      return '';
    }).join('');
  }

  return renderNode(root, 0, rootInstance, invalidFields, '', invalidComponents);
}

/**
 * Creates and configures the review modal DOM element
 */

export function createReviewModal(hasErrors, fieldErrorCount, reviewHtml, supportNumber, showSupportFields = true, errorDetails = []) {
  if (typeof document !== "undefined" && !document.getElementById("customDropdownStyle")) {
    const styleTag = document.createElement("style");
    styleTag.id = "customDropdownStyle";
    styleTag.textContent = customCSS;
    document.head.appendChild(styleTag);
  }
  const modal = document.createElement("div");

  modal.style.zIndex = "1000";
  modal.style.setProperty('overflow-y', 'auto', 'important');
  modal.className = "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";
  document.body.classList.add("no-scroll"); // block page scroll
  modal.innerHTML = `
    <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>
      <div idx="22" class="mb-4 text-sm" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
        ${reviewHtml}
      </div>
      ${hasErrors ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
         <p class="text-red-700 font-medium">⚠️ Fix the errors in the form before submitting</p>
      </div>` : ''}
      
 ${!hasErrors && showSupportFields ? `
      <div class="flex space-x-4 mb-4">
        <div class="text-sm w-1/2">
          <label class="block font-medium mb-1">Support Number</label>
          <input type="text" id="supportNumber" class="w-full border rounded p-2 text-sm bg-gray-100" value="${supportNumber}" disabled />
        </div>
        <div class="custom-dropdown">
          <label class="dropdown-label">Verified</label>
          <div id="verified" class="dropdown-selected w-full border rounded p-2 text-sm" tabindex="0" data-value="Empty">
            <span class="selected-text">Select verification type</span>
            <i class="dropdown icon"></i> 
          </div>
          <ul class="dropdown-list">
            <li data-value="Empty">Select verification type</li>
            <li data-value="App">App</li>
            <li data-value="Support">Support</li>
            <li data-value="Not Verified">Not Verified</li>
          </ul>
        </div>
        <div id="selected-value"></div>
      </div>` : ''}
      <div idx="23" class="mb-4 text-sm w-full" id="screenshotWrapper" style="display: none;">
        <label for="screenshotContainer">Screenshot Upload<span class="text-red-500">(Required)*</label>
        <div id="screenshotContainer"></div>
      </div>
      <div idx="24" class="mb-4 text-sm w-full" id="notesOptionalWrapper" style="display: none;">
        <label class="block font-medium mb-1">Notes (optional)</label>
        <textarea id="notesOptional" class="w-full border rounded p-2 text-sm"></textarea>
      </div>
      <div idx="25" class="mb-4 text-sm w-full" id="notesRequiredWrapper" style="display: none;">
        <label class="block font-medium mb-1">Explain why not verified<span class="text-red-500">(Required)*</span></label>
        <textarea id="notesRequired" class="w-full border rounded p-2 text-sm"></textarea>
      </div>
      <div class="mt-4 flex justify-end space-x-4">
        <button class="px-4 py-2 btn btn-primary rounded" id="cancelModal">${hasErrors ? 'Close' : 'Cancel'}</button>
        ${!hasErrors ? '<button class="px-4 py-2 btn btn-primary rounded" id="submitModal">Submit</button>' : ''}
      </div>
    `;

  return modal;
}

/**
 * Validates the modal form fields
 */
export function validateModalForm(modal, screenshotComp, formData = null, requireSupportFields = true) {
  let hasErrors = false;

  if (requireSupportFields) {
    const verifiedElement = modal.querySelector("#verified");
    const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";

    if (verifiedElement && selectedVerificationType === "Empty") {
      verifiedElement.style.border = "2px solid red";
      verifiedElement.classList.add("invalid-field");
      hasErrors = true;
    } else if (verifiedElement) {
      verifiedElement.style.border = "";
      verifiedElement.classList.remove("invalid-field");
    }
    const supportNumberElement = modal.querySelector("#supportNumber");
    if (supportNumberElement && !supportNumberElement.value.trim()) {
      supportNumberElement.style.border = "2px solid red";
      supportNumberElement.classList.add("invalid-field");
      hasErrors = true;
    } else if (supportNumberElement) {
      supportNumberElement.style.border = "";
      supportNumberElement.classList.remove("invalid-field");
    }
  }

  if (requireSupportFields) {
    const verifiedElement = modal.querySelector("#verified");
    const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";
    const screenshotWrapper = modal.querySelector("#screenshotWrapper");
    const isScreenshotVisible = screenshotWrapper && screenshotWrapper.style.display !== "none";

    if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && isScreenshotVisible) {
      const uploadedFiles = screenshotComp ? (screenshotComp.getValue() || []) : [];

      if (uploadedFiles.length === 0) {
        const screenshotContainer = modal.querySelector("#screenshotContainer");
        if (screenshotContainer) {
          screenshotContainer.style.border = "2px solid red";
          hasErrors = true;
        }
      } else if (modal.querySelector("#screenshotContainer")) {
        modal.querySelector("#screenshotContainer").style.border = "";
      }
    } else {
      const screenshotContainer = modal.querySelector("#screenshotContainer");
      if (screenshotContainer) {
        screenshotContainer.style.border = "";
        screenshotContainer.classList.remove("invalid-field");
        const childElements = screenshotContainer.querySelectorAll("*");
        childElements.forEach(el => {
          el.style.border = "";
          el.classList.remove("invalid-field");
        });
      }
    }

    if (selectedVerificationType === "Not Verified") {
      const notesRequiredElement = modal.querySelector("#notesRequired");
      if (notesRequiredElement && !notesRequiredElement.value.trim()) {
        notesRequiredElement.style.border = "2px solid red";
        notesRequiredElement.classList.add("invalid-field");
        hasErrors = true;
      } else if (notesRequiredElement) {
        notesRequiredElement.style.border = "";
        notesRequiredElement.classList.remove("invalid-field");
      }
    }
  }

  let hasFormData = true;
  if (formData) {
    hasFormData = checkFormHasData(formData);
  }

  const submitButton = modal.querySelector("#submitModal");
  if (submitButton && submitButton.style != null) {
    if (hasErrors || !hasFormData) {
      submitButton.style.backgroundColor = "gray";
      submitButton.style.cursor = "not-allowed";
      submitButton.disabled = true;
    } else {
      submitButton.style.backgroundColor = "";
      submitButton.style.cursor = "pointer";
      submitButton.disabled = false;
    }
  }

  return hasErrors;
}

/**
 * Checks if the form has meaningful data
 */
function checkFormHasData(formData) {
  if (!formData || typeof formData !== 'object') {
    return false;
  }

  const hasData = Object.values(formData).some(value => {
    if (value === null || value === undefined || value === '') {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0 && value.some(item =>
        item !== null && item !== undefined && item !== ''
      );
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0 && Object.values(value).some(v =>
        v !== null && v !== undefined && v !== ''
      );
    }
    return true;
  });

  return hasData;
}

/**
 * Sets up screenshot component in the modal
 */
export function setupScreenshotComponent(modal, screenshotComp, validateModalForm, formData = null, requireSupportFields = true) {
  if (!screenshotComp) return null;
  const screenshotContainer = modal.querySelector("#screenshotContainer");
  if (!screenshotContainer) return null;

  const html = screenshotComp.render();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const compEl = tmp.firstElementChild;
  screenshotContainer.appendChild(compEl);
  screenshotComp.attach(compEl);

  screenshotComp.component.hidden = false;
  if (typeof screenshotComp.setVisible === "function") {
    screenshotComp.setVisible(true);
  } else {
    screenshotComp.visible = true;
  }

  if (screenshotComp && typeof screenshotComp.on === 'function') {
    screenshotComp.on('change', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
  }

  return {
    hide: () => {
      screenshotComp.component.hidden = true;
      if (typeof screenshotComp.setVisible === "function") {
        screenshotComp.setVisible(false);
      } else {
        screenshotComp.visible = false;
      }
    },
    show: () => {
      screenshotComp.component.hidden = false;
      if (typeof screenshotComp.setVisible === "function") {
        screenshotComp.setVisible(true);
      } else {
        screenshotComp.visible = true;
      }
    }
  };
}

/**
 * Sets up modal event handlers
 */
export function setupModalEventHandlers(modal, screenshotComp, hideScreenshot, validateModalForm, onSubmit, formData = null, requireSupportFields = true) {

  const verifiedSelect = modal.querySelector("#verified");
  const screenshotWrapper = modal.querySelector("#screenshotWrapper");
  const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
  const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

  if (verifiedSelect) {
    verifiedSelect.onchange = () => {
      // const value = verifiedSelect.value;
      const value = verifiedSelect.getAttribute('data-value');
      const needShot = value === "App" || value === "Support";

      if (screenshotWrapper) {
        screenshotWrapper.style.display = needShot ? "block" : "none";
      }
      if (notesOptionalWrapper) {
        notesOptionalWrapper.style.display = needShot ? "block" : "none";
      }
      if (notesRequiredWrapper) {
        notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
      }

      if (needShot && hideScreenshot && typeof hideScreenshot.show === 'function') {
        hideScreenshot.show();
      } else if (!needShot && hideScreenshot && typeof hideScreenshot.hide === 'function') {
        hideScreenshot.hide();
        const screenshotContainer = modal.querySelector("#screenshotContainer");
        if (screenshotContainer) {
          screenshotContainer.style.border = "";
          screenshotContainer.classList.remove("invalid-field");
          const childElements = screenshotContainer.querySelectorAll("*");
          childElements.forEach(el => {
            el.style.border = "";
            el.classList.remove("invalid-field");
          });
        }
      }

      validateModalForm(modal, screenshotComp, formData, requireSupportFields);
    };
  }

  modal.querySelector("#cancelModal").onclick = async () => {
    if (hideScreenshot && typeof hideScreenshot === 'function') {
      hideScreenshot();
    }
    document.body.classList.remove("no-scroll"); // restore page scroll
    document.body.removeChild(modal);
  };

  const submitButton = modal.querySelector("#submitModal");
  if (submitButton) {
    submitButton.onclick = async () => {
      const hasErrors = validateModalForm(modal, screenshotComp, formData, requireSupportFields);
      if (hasErrors) return;

      const verifiedElement = modal.querySelector("#verified");
      const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";
      const notesRequired = modal.querySelector("#notesRequired")?.value || "";
      const notesOptional = modal.querySelector("#notesOptional")?.value || "";
      const supportNumber = modal.querySelector("#supportNumber")?.value || "Unavailable";

      let uploadedFiles = [];
      if (screenshotComp) {
        uploadedFiles = screenshotComp.getValue() || [];
      }

      if (requireSupportFields) {
        if (selectedVerificationType === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && uploadedFiles.length === 0) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }
      }

      await onSubmit({
        selectedVerificationType,
        notesRequired,
        notesOptional,
        supportNumber,
        uploadedFiles
      });

      if (hideScreenshot && typeof hideScreenshot === 'function') {
        hideScreenshot();
      }
      document.body.classList.remove("no-scroll"); 
      document.body.removeChild(modal);
    };
  }

  const addInputListeners = (element) => {
    if (!element) return;

    const inputs = element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
      input.addEventListener('change', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
    });
  };

  addInputListeners(modal);
}

/**
 * Updates form values with modal data
 */
export function updateFormWithModalData(root, modalData) {
  root.getComponent("reviewed")?.setValue("true");
  root.getComponent("supportNumber")?.setValue(modalData.supportNumber);
  root.getComponent("verifiedSelect")?.setValue(modalData.selectedVerificationType);
  root.getComponent("notesOptional")?.setValue(modalData.notesOptional);
  root.getComponent("notesRequired")?.setValue(modalData.notesRequired);
}

/**
 * Collects and processes form data for review display
 */
export function collectFormDataForReview(root) {
  const allData = root.getValue();
  const supportNumber = allData?.data?.billingCustomer || "Unavailable";

  return {
    allData,
    supportNumber
  };
}
/**
 * Scroll to the bottom of the page when Review and Submit button is clicked
 */
export function scrollToEndOfPage() {
    // Scroll exactly to the bottom
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'  // change to 'smooth' if you want animation
    });
}

/**
 * Updates datagrid and form values before review
 */
export function updateFormValuesBeforeReview(root) {
  const allDatagrids = [];


  root.everyComponent(comp => {
    const componentType = comp.component?.type || comp.type;

    if (componentType === 'well' || componentType === 'table') {
      allDatagrids.push(comp);
    }
  });

  for (const datagrid of allDatagrids) {
    try {
      if (datagrid.updateValue) {
        datagrid.updateValue();
      }
      if (datagrid.component?.type === 'datatable' && datagrid.savedRows) {
        const savedRows = datagrid.savedRows;
        savedRows.forEach(row => {
          if (row.components) {
            const rowComponents = row.components;
            rowComponents.forEach(component => {
              if (component && component.updateValue) {
                component.updateValue();
              }
            });
          }
        });
      } else if (datagrid.rows) {
        const datagridRows = datagrid.rows;
        datagridRows.forEach(row => {
          const values = Object.values(row);
          values.forEach(component => {
            if (component && component.updateValue) {
              component.updateValue();
            }
          });
        });
      }
    } catch (e) {
    }
  }

  const rootComponents = root.components;
  rootComponents.forEach(comp => {
    if (comp.updateValue && typeof comp.updateValue === 'function') {
      try {
        comp.updateValue();
      } catch (e) { }
    }
  });

}


// Add this at the top of your JS file (for example: reviewHelpers.js)
const customCSS = `
.no-scroll {
  overflow: hidden;
}
.custom-dropdown {
  width: 220px;
  position: relative;
}
.dropdown-list { display: none; }
.dropdown-list.open { display: block; }
.dropdown-label {
  display: block;
  font-weight: 500;
  margin-bottom: 6px;
}
.dropdown-selected {
  margin-top: -2px;
  border: 1px solid #888;
  border-radius: 5px;
  padding: 10px 32px 10px 10px;
  background: #fff;
  cursor: pointer;
  position: relative;
  min-height: 38px;
}

.dropdown-list {
  position: absolute;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #888;
  border-radius: 5px;
  margin: 2px 0 0 0;
  z-index: 100;
  list-style: none;
  padding: 0;
  animation: fadeIn 0.2s;
}
.dropdown-list li {
  cursor: pointer;
  padding-left: 5px;
}
.dropdown-list li:hover,
.dropdown-list li.selected {
  background: #f0f4ff;
}
/* Optional: Animate dropdown open */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px);}
  to   { opacity: 1; transform: none; }
}
.dropdown-selected i.dropdown.icon {
 position: absolute;
 right: 10px;
 top: 50%;
 transform: translateY(-50%) rotate(45deg); /* arrow pointing down */
 border: solid #888;
 border-width: 0 2px 2px 0;
 padding: 4px;
 display: inline-block;
 pointer-events: none;
 transition: transform 0.2s ease;
}
.dropdown-selected.open i.dropdown.icon {
  transform: translateY(-50%) rotate(225deg); /* pointing up */
}

`;
