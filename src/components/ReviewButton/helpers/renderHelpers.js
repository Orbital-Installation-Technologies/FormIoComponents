/**
 * Main rendering helpers for ReviewButton component
 * Contains the main renderLeaves function and related rendering logic
 */

import { shouldFlattenContainer, isContainerType } from "./validationUtils.js";
import { findComponentByKey } from "./dataProcessingHelpers.js";
import { formatValue, firstLeafVal, getInvalidStyle, isFieldInvalid } from "./uiRenderingHelpers.js";

/**
 * Main renderNode function - renders a node and its children
 */
// Battery optimization: Cache regex patterns and utility functions
const regexPatterns = {
  numericEnd: /^\d+\]$/,
  textareaMarker: /__TEXTAREA__/g,
  arrayIndex: /\[(\d+)\]/,
  dotPattern: /\./g,
  panelPattern: /\.panel[^.]*\./g,
  panelEnd: /\.panel[^.]*$/
};

const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;

function renderNode(node, depth = 0, rootInstance = null, invalidFields = new Set(), basePath = '', invalidComponents = new Set()) {
  let pad = `padding-left:10px; border-left:1px dotted #ccc;`;

  // Battery optimization: Collect entries and sort more efficiently
  const entries = [];
  for (const k in node) {
    if (node.hasOwnProperty(k)) {
      entries.push([k, node[k]]);
    }
  }
  
  entries.sort((a, b) => {
    const aIsTagpad = a[1]?.__label === 'Tagpad' || a[1]?.__comp?.component?.type === 'tagpad';
    const bIsTagpad = b[1]?.__label === 'Tagpad' || b[1]?.__comp?.component?.type === 'tagpad';

    if (aIsTagpad && bIsTagpad) {
      return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
    }

    if (aIsTagpad) return (a[1]?.__formIndex ?? -1) - (a[1]?.__formIndex ?? 0);
    if (bIsTagpad) return (a[1]?.__formIndex ?? 0) - (b[1]?.__formIndex ?? -1);

    return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
  });

  // Battery optimization: Use array for string building instead of map
  const parts = [];
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i];
    const isAddressComponentRender = v.__comp?.component?.type === 'address' || v.__comp?.type === 'address';
    
    // Check if component is invalid FIRST - if invalid, always show it regardless of visibility
    const isInvalid = isFieldInvalid(v.__comp, k, invalidFields) || invalidComponents.has(v.__comp);
    
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
      if (i === 0) {
        delete v.__comp;
      } else if (v?.__rows) {
        v.__children = {};
        // Battery optimization: Use for...in instead of Object.values/Object.entries
        for (const rowKey in v.__rows) {
          if (v.__rows.hasOwnProperty(rowKey)) {
            const row = v.__rows[rowKey];
            if (row?.__children) {
              for (const childKey in row.__children) {
                if (row.__children.hasOwnProperty(childKey)) {
                  const childVal = row.__children[childKey];
                  v.__children[childVal.__label] = childKey;
                }
              }
            }
          }
        }
        v.__rows = {};
      }
    }

    if (regexPatterns.numericEnd.test(k) || v?.__comp == undefined) {
        const result = v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath, invalidComponents) : '';
        if (result) parts.push(result);
        continue;
    }

    if (v && v.__leaf) {
      const result = renderLeafNode(v, k, depth, basePath, invalidFields, invalidComponents);
      if (result) parts.push(result);
      continue;
    }

    if (v && typeof v === 'object') {
        const result = renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents);
        if (result) parts.push(result);
        continue;
    }
  }
  
  return parts.join('');
}

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

  // Battery optimization: Cache path normalization function
  const normalizePath = (p) => {
    return p.replace(/\.data\./g, '.')
      .replace(/^data\./, '')
      .replace(/^form\./, '')
      .replace(/^submission\./, '');
  };
  
  const normalizePathForMatching = (p) => {
    return p.replace(regexPatterns.panelPattern, '.').replace(regexPatterns.panelEnd, '');
  };
  
  const removeDuplicateFormNames = (p) => {
    return p.replace(/^([^.]+)\.\1(\.|$)/, '$1$2');
  };

  for (const { path, label, value, comp, formIndex } of sortedLeaves) {
    // Battery optimization: Use cached normalization functions
    let normalizedPath = normalizePath(path);
    
    // Remove duplicate form names (e.g., hardwareForm.hardwareForm -> hardwareForm)
    normalizedPath = removeDuplicateFormNames(normalizedPath);
    
    // Remove intermediate panel segments for matching purposes
    // e.g., hardwareForm.data.dataGrid[0].panel.panel1.picOfSn4 -> hardwareForm.data.dataGrid[0].picOfSn4
    const pathForMatching = normalizePathForMatching(normalizedPath);
    
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

      // Battery optimization: Use cached regex
      const idxMatch = seg.match(regexPatterns.arrayIndex);
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
            // Battery optimization: Use for...in instead of Object.keys().forEach()
            for (const childKey in node.__children) {
              if (node.__children.hasOwnProperty(childKey)) {
                if (node.__children[childKey] && !node.__children[childKey].__comp) {
                  node.__children[childKey].__comp = comp;
                }
              }
            }
            ptr = node.__children;
          }
        }
        if ((comp?.component?.type === 'datamap' || comp?.parent.type === 'datamap')) {
          if(ptr && ptr[key] && ptr[key].__comp) {
            ptr[key].__comp = comp;
            if (ptr[key].__children && typeof ptr[key].__children === 'object') {
              // Battery optimization: Use for...in instead of Object.keys().forEach()
              for (const childKey in ptr[key].__children) {
                if (ptr[key].__children.hasOwnProperty(childKey)) {
                  if (ptr[key].__children[childKey] && !ptr[key].__children[childKey].__comp) {
                    ptr[key].__children[childKey].__comp = comp;
                  }
                }
              }
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

    // Battery optimization: Use array for string building instead of map
    const parts = [];
    for (let i = 0; i < sortedEntries.length; i++) {
      const [k, v] = sortedEntries[i];
      const isAddressComponentRender = v.__comp?.component?.type === 'address' || v.__comp?.type === 'address';
      
      // Battery optimization: Cache path calculations (trimKey is defined at module level)
      const compPath = trimKey(v.__comp?.path || v.__comp?.key || v.__comp?.component?.key || '');
      const compKey = trimKey(v.__comp?.key || v.__comp?.component?.key || '');
      const fullPath = basePath ? `${basePath}.${trimKey(k)}` : trimKey(k);
      
      // Battery optimization: Early exit for invalid checks - check Set.has first (fastest)
      const isInvalidByComponent = invalidComponents.has(v.__comp);
      const isInvalidByCompKey = compKey && invalidFields.has(compKey);
      const isInvalidByCompPath = compPath && invalidFields.has(compPath);
      
      // Battery optimization: Only call isFieldInvalid if Set checks didn't find it
      let isInvalid = isInvalidByComponent || isInvalidByCompKey || isInvalidByCompPath;
      if (!isInvalid) {
        const isInvalidByPath = isFieldInvalid(v.__comp, compPath, invalidFields);
        const isInvalidByFullPath = isFieldInvalid(v.__comp, fullPath, invalidFields);
        const isInvalidByKey = isFieldInvalid(v.__comp, k, invalidFields);
        isInvalid = isInvalidByPath || isInvalidByFullPath || isInvalidByKey;
      }
      
      // If component is invalid, skip all visibility checks and show it
      if (!isInvalid) {
        if (v.__comp?._visible == false || v.__comp?.type === 'datasource') {
          continue;
        }
        
        if (v.__comp?.component?.hidden === true || v.__comp?.hidden === true) {
          continue;
        }
        
        if (v.__comp?.disabled === true || v.__comp?.component?.disabled === true) {
          if (v.__comp?.component?.reviewVisible !== true) {
            continue;
          }
        }
        
        const isRequired = v.__comp?.component?.validate?.required === true;
        const isReviewVisible = v.__comp?.component?.reviewVisible === true;
        
        if (isRequired && !isReviewVisible) {
          continue;
        }
        
        if (!isRequired && !isReviewVisible && !isAddressComponentRender) {
          continue;
        }
      }

      if (v.__comp?.parent?.type === 'datamap') {
        if (i === 0) {
          delete v.__comp;
        } else if (v?.__rows) {
          v.__children = {};
          // Battery optimization: Use for...in instead of Object.values/Object.entries
          for (const rowKey in v.__rows) {
            if (v.__rows.hasOwnProperty(rowKey)) {
              const row = v.__rows[rowKey];
              if (row?.__children) {
                for (const childKey in row.__children) {
                  if (row.__children.hasOwnProperty(childKey)) {
                    const childVal = row.__children[childKey];
                    v.__children[childVal.__label] = childKey;
                  }
                }
              }
            }
          }
          v.__rows = {};
        }
      }

      if (regexPatterns.numericEnd.test(k) || v?.__comp == undefined) {
        const result = v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath, invalidComponents, isInsideDatagridRow) : '';
        if (result) parts.push(result);
        continue;
      }

      if (v && v.__leaf) {
        // Battery optimization: Always render leaf nodes - visibility is handled in renderLeafNode
        const result = renderLeafNode(v, k, depth, basePath, invalidFields, invalidComponents);
        if (result) parts.push(result);
        continue;
      }

      if (v && typeof v === 'object') {
        // Battery optimization: Check hasRows/hasChildren more efficiently
        let hasRows = false;
        let rowsCount = 0;
        if (v.__rows) {
          for (const key in v.__rows) {
            if (v.__rows.hasOwnProperty(key)) {
              rowsCount++;
              if (rowsCount > 0) {
                hasRows = true;
                break;
              }
            }
          }
        }
        
        let hasChildren = false;
        if (v.__children) {
          for (const key in v.__children) {
            if (v.__children.hasOwnProperty(key)) {
              hasChildren = true;
              break;
            }
          }
        }
        
        // If we're inside a datagrid row and this container has rows, flatten it
        if (isInsideDatagridRow && hasRows) {
          // Battery optimization: Build flattened content more efficiently
          const flattenedParts = [];
          for (const i in v.__rows) {
            if (v.__rows.hasOwnProperty(i)) {
              const r = v.__rows[i];
              let rHasChildren = false;
              if (r.__children) {
                for (const key in r.__children) {
                  if (r.__children.hasOwnProperty(key)) {
                    rHasChildren = true;
                    break;
                  }
                }
              }
              if (rHasChildren) {
                const result = renderNode(r.__children, depth, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`, invalidComponents, true);
                if (result) flattenedParts.push(result);
              }
            }
          }
          if (flattenedParts.length > 0) {
            parts.push(flattenedParts.join(''));
          }
          continue;
        }
        
        // If inside datagrid row and container has children but no rows, render children directly
        if (isInsideDatagridRow && hasChildren && !hasRows) {
          const result = renderNode(v.__children, depth, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents, true);
          if (result) parts.push(result);
          continue;
        }
        
        const result = renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents);
        if (result) parts.push(result);
      }
    }
    
    return parts.join('');
  }

  return renderNode(root, 0, rootInstance, invalidFields, '', invalidComponents);
}

/**
 * Renders a leaf node
 */
function renderLeafNode(v, k, depth, basePath, invalidFields, invalidComponents = new Set()) {
  const isFormComponent = v.__comp?.type === 'form' || v.__comp?.component?.type === 'form';
  const val = firstLeafVal(v);
  const isTagpadDot = (v.__comp?.type === 'tagpad') || (v.__comp?.parent?.type === 'tagpad');
  const isEmptyDatagrid = val && typeof val === 'object' && val._empty === true;

  // Check if this component is invalid using multiple path variations
  // The component's actual path might differ from the rendered path
  // e.g., leaf path: "hardwareForm.data.dataGrid[0].panel.panel1.picOfSn4"
  //      invalid field: "hardwareForm.data.dataGrid[0].picOfSn4"
  // Trim trailing spaces from keys
  const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
  const compPath = trimKey(v.__comp?.path || v.__comp?.key || v.__comp?.component?.key || '');
  const compKey = trimKey(v.__comp?.key || v.__comp?.component?.key || '');
  const fullPath = basePath ? `${basePath}.${trimKey(k)}` : trimKey(k);
  
  // Check multiple path variations to catch invalid fields
  // Use the component's actual path for matching
  const invalidStyle = getInvalidStyle(v.__comp, compPath || fullPath, basePath, invalidFields, invalidComponents);

  if (isFormComponent) {
    return renderFormComponent(v, k, depth, basePath, invalidFields, invalidComponents);
  } else if (isEmptyDatagrid) {
    return `<div idx="7" depth="${depth}" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${v.__label || k}:</strong> <span style="font-style: italic; color: #666;">No data to display</span></div>`;
  } else if (isTagpadDot) {
    return `<div idx="5" depth="${depth}" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${v.__label || k}:</strong> ${val}</div>`;
  } else if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
    // Battery optimization: Use cached regex
    const textareaContent = val.replace(regexPatterns.textareaMarker, '');
    return `<div idx="6" depth="${depth}" style="padding-left:10px; border-left:1px dotted #ccc; display: flex; align-items: flex-start;">
              <strong style="${invalidStyle}">${v.__label || k}:</strong>
              ${textareaContent}
            </div>`;
  } else {
    return `<div idx="6" depth="${depth}" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${v.__label || k}:</strong> ${val}</div>`;
  }
}

/**
 * Renders a form component
 */
function renderFormComponent(v, k, depth, basePath, invalidFields, invalidComponents = new Set()) {
  const formValue = v.__value || {};
  let formContentHtml = '<div idx="10" depth="${depth}" style="padding-left: 10px;">';

  if (typeof formValue === 'object' && !Array.isArray(formValue)) {
    // Battery optimization: Use for...in instead of Object.entries
    for (const fieldKey in formValue) {
      if (formValue.hasOwnProperty(fieldKey)) {
        const fieldVal = formValue[fieldKey];
        if (fieldVal !== null && fieldVal !== undefined) {
          const displayVal = typeof fieldVal === 'object'
            ? JSON.stringify(fieldVal)
            : String(fieldVal);
          const fieldPath = `${k}.${fieldKey}`;
          const invalidStyle = getInvalidStyle(v.__comp, fieldPath, basePath, invalidFields, invalidComponents);
          formContentHtml += `<div idx="2" depth="${depth}" style="margin-left:10px; padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${fieldKey}:</strong> ${displayVal}</div>`;
        }
      }
    }
  }

  formContentHtml += '</div>';

  return `
    <div idx="1" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${getInvalidStyle(v.__comp, k, basePath, invalidFields, invalidComponents)}">${v.__label || k}:</strong></div>
    ${formContentHtml || `<div idx="3" style="padding-left: 10px;"><div idx="4" style="padding-left:10px; border-left:1px dotted #ccc;">(No data)</div></div>`}
  `;
}

/**
 * Renders a container node
 */
function renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents = new Set()) {
  if (!v.__label) {
    const foundComponent = findComponentByKey(rootInstance, k);
    if (foundComponent) {
      v.__label = foundComponent.component.component?.label || foundComponent.component.label || k;
    } else {
      v.__label = k;
    }
  }

  // Battery optimization: Check hasChildren/hasRows more efficiently
  let hasChildren = false;
  if (v.__children) {
    for (const key in v.__children) {
      if (v.__children.hasOwnProperty(key)) {
        hasChildren = true;
        break;
      }
    }
  }
  
  let hasRows = false;
  if (v.__rows) {
    for (const key in v.__rows) {
      if (v.__rows.hasOwnProperty(key)) {
        hasRows = true;
        break;
      }
    }
  }
  const isDataGridComponent = v.__kind === 'datagrid' || v.__kind === 'datatable' || v.__kind === 'editgrid';
  const isDataTableComponent = v.__comp?.component?.type === 'datatable' || v.__comp?.type === 'datatable';
  const isTableComponent = v.__comp?.component?.type === 'table' || v.__comp?.type === 'table';
  const isContainerComponent = 
      !isDataGridComponent && !isDataTableComponent && !isTableComponent &&
      ((isContainerType([v.__comp?.component?.type, v.__comp?.type, v.__value?._type]) ) || 
      Array.isArray(v.__value?._row));

  const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k + " - missing __label") );
  
  let headerStyle = ""
  const header = `<div idx="12" style="${headerStyle}">`;

  if (isDataTableComponent && v.__comp) {
    const comp = v.__comp;
    const mockValue = { _type: 'datatable' };
    const tableHtml = formatValue(mockValue, comp);
    
    return `${header}<div style="margin-bottom:10px;"><strong>${displayLabel}</strong></div>${tableHtml}</div>`;
  }

  if (isTableComponent && v.__comp) {
    const comp = v.__comp;
    const mockValue = { _type: 'table' };
    const tableHtml = formatValue(mockValue, comp);
    
    return `${header}<div style="margin-bottom:10px;"><strong>${displayLabel}</strong></div>${tableHtml}</div>`;
  }

  if (isContainerComponent) {
    return renderContainerComponent(v, k, depth, rootInstance, invalidFields, basePath, pad, hasChildren);
  } else {
    headerStyle += "border-left:1px dotted #ccc;"
  }

  const conditionMet = (v.__kind === 'datagrid' || v.__kind === 'datatable' || v.__kind === 'editgrid') && hasRows;
  const isDataGridWithNoRows = (v.__kind === 'datagrid' || v.__kind === 'datatable' || v.__kind === 'editgrid') && !hasRows;
  
  if (conditionMet) {
    return renderDataGridRows(v, k, depth, rootInstance, invalidFields, basePath, header, invalidComponents);
  }
  
  if (isDataGridWithNoRows) {
    return `${header}<div style="margin-bottom:10px;"><strong>${displayLabel}</strong></div><div style="font-style: italic; color: #666;">No data to display</div></div>`;
  }

  // Check if this container is nested inside a datagrid row - if so, don't create row labels
  const isNestedInDatagrid = basePath && (basePath.includes('[0]') || basePath.includes('[1]') || basePath.includes('[2]') || basePath.match(/\[\d+\]/));
  
  // If nested in datagrid and has rows, ALWAYS flatten - never create row labels
  // Also check if this is a panel/well component - they should NEVER create rows when nested in datagrid
  const isPanelOrWell = v.__comp?.component?.type === 'panel' || v.__comp?.type === 'panel' ||
                        v.__comp?.component?.type === 'well' || v.__comp?.type === 'well';
  // Panels/wells inside datagrid rows should ALWAYS flatten, even if they somehow have rows
  const shouldFlattenRows = isNestedInDatagrid || (isPanelOrWell && isNestedInDatagrid);
  
  // CRITICAL: If this is a panel/well and we're inside a datagrid row, NEVER render rows
  // Force flatten even if hasRows is true - this prevents duplicate "Row 1:" labels
  if (isPanelOrWell && isNestedInDatagrid && hasRows) {
    // Flatten immediately - don't create row labels
    // Merge all row children into a single flat structure
    const allFlattenedChildren = {};
    // Battery optimization: Use for...in instead of Object.entries
    for (const i in v.__rows) {
      if (v.__rows.hasOwnProperty(i)) {
        const r = v.__rows[i];
        if (r.__children) {
          for (const childKey in r.__children) {
            if (r.__children.hasOwnProperty(childKey)) {
              allFlattenedChildren[childKey] = r.__children[childKey];
            }
          }
        }
      }
    }
    // Also include direct children if any
    if (v.__children) {
      Object.assign(allFlattenedChildren, v.__children);
    }
    // Render all children directly without row labels
    const flattenedContent = Object.keys(allFlattenedChildren).length > 0
      ? renderNode(allFlattenedChildren, depth, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents, true)
      : '';
    return `${header}${flattenedContent}</div>`;
  }
  
  // Also check: if panel/well is nested and has children but no rows, render children directly
  if (isPanelOrWell && isNestedInDatagrid && !hasRows && hasChildren) {
    return `${header}${renderNode(v.__children, depth, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents, true)}</div>`;
  }
  
  const childrenHtml = [
    hasRows && !shouldFlattenRows
      ? `<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${(() => {
        // Battery optimization: Build rows HTML more efficiently
        const rowParts = [];
        const isTagpad = k === 'tagpad' ||
          v.__label === 'Tagpad' ||
          v.__comp?.component?.type === 'tagpad' ||
          v.__comp?.type === 'tagpad';
        
        for (const i in v.__rows) {
          if (v.__rows.hasOwnProperty(i)) {
            const r = v.__rows[i];
            const rowLabel = isTagpad ? `Tag ${Number(i) + 1}` : `Row ${Number(i) + 1}`;
            const rowHasErrors = isRowInvalid(r, k, parseInt(i), invalidFields, invalidComponents);
            const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

            let rHasChildren = false;
            if (r.__children) {
              for (const key in r.__children) {
                if (r.__children.hasOwnProperty(key)) {
                  rHasChildren = true;
                  break;
                }
              }
            }
            
            const content = rHasChildren
              ? renderNode(r.__children, depth + 1, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`, invalidComponents, true)
              : ``;

            const rowClass = isTagpad ? 'tagpad-row' : 'data-row';
            rowParts.push(`<li class="${rowClass}" style="margin-left:0 !important; padding-left: 0 !important;"><strong style="${rowLabelStyle}">${rowLabel}:</strong>${content}</li>`);
          }
        }
        return rowParts.join('');
      })()}</ul>` : 
    hasRows && shouldFlattenRows
      ? (() => {
          // Battery optimization: Flatten nested rows more efficiently
          const flattenedParts = [];
          for (const i in v.__rows) {
            if (v.__rows.hasOwnProperty(i)) {
              const r = v.__rows[i];
              let rHasChildren = false;
              if (r.__children) {
                for (const key in r.__children) {
                  if (r.__children.hasOwnProperty(key)) {
                    rHasChildren = true;
                    break;
                  }
                }
              }
              if (rHasChildren) {
                const result = renderNode(r.__children, depth, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`, invalidComponents, true);
                if (result) flattenedParts.push(result);
              }
            }
          }
          return flattenedParts.join('');
        })() : '',
    hasChildren ? renderNode(v.__children, depth + 1, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents, shouldFlattenRows || isNestedInDatagrid) : ''
  ].join('');
  return `${header}${childrenHtml}</div>`;
}

/**
 * Renders container components
 */
function renderContainerComponent(v, k, depth, rootInstance, invalidFields, basePath, pad, hasChildren) {
  let panelChildrenHtml = '';

  if (hasChildren) {
    const containerPath = basePath ? `${basePath}.${k}` : k;
    panelChildrenHtml = renderNode(v.__children, depth + 1, rootInstance, invalidFields, containerPath, invalidComponents);
  } else if (v.__comp && Array.isArray(v.__comp.components) && v.__comp.components.length > 0) {
    const artificialChildren = {};
    v.__comp.components.forEach((comp, index) => {
      if (comp && comp.key) {
        artificialChildren[comp.key] = {
          __label: comp.label || comp.key,
          __comp: comp,
          __leaf: !comp.components || comp.components.length === 0,
          __value: comp.defaultValue || '',
          __children: comp.components && comp.components.length > 0 ? 
            comp.components.reduce((acc, child, idx) => {
              if (child && child.key) {
                acc[child.key] = {
                  __label: child.label || child.key,
                  __comp: child,
                  __leaf: !child.components || child.components.length === 0,
                  __value: child.defaultValue || ''
                };
              }
              return acc;
            }, {}) : {}
        };
      }
    });
    
    const containerPath = basePath ? `${basePath}.${k}` : k;
     
    if (v?.__comp?.editRows && Array.isArray(v.__comp.editRows)) {
      // Battery optimization: Build transformedEditRows more efficiently
      const transformedEditRows = {};
      
      for (let rowIdx = 0; rowIdx < v.__comp.editRows.length; rowIdx++) {
        const row = v.__comp.editRows[rowIdx];
        const rowKey = `Row ${rowIdx + 1}`;
        transformedEditRows[rowKey] = {
          __children: {},
          __comp: v.__comp
        };
        
        if (row.components && Array.isArray(row.components)) {
          for (let compIdx = 0; compIdx < row.components.length; compIdx++) {
            const comp = row.components[compIdx];
            const compKey = comp.key || comp.component?.key || 'unknown';
            const compValue = row.data && row.data[compKey] ? row.data[compKey] : (comp.getValue ? comp.getValue() : comp.dataValue);
            const compLabel = comp.component?.label || comp.label || compKey;
            
            transformedEditRows[rowKey].__children[compKey] = {
              __leaf: true,
              __label: compLabel,
              __value: compValue,
              __comp: comp,
              __children: {},
              __rows: {}
            };
          }
        }
      }
      
      panelChildrenHtml = renderNode(transformedEditRows, depth + 1, rootInstance, invalidFields, containerPath, invalidComponents);
    } else {
      panelChildrenHtml = renderNode(artificialChildren, depth + 1, rootInstance, invalidFields, containerPath, invalidComponents);
    }
  }

  const customStructure = v.__value && v.__value._type && v.__value._row;
  if (customStructure) {
    const containerType = v.__value._type;
    const containerLabel = v.__value._label || displayLabel || containerType;
    let customChildrenHtml = '';

    if (Array.isArray(v.__value._row)) {
      // Battery optimization: Build customChildrenHtml more efficiently
      const customParts = [];
      for (let itemIdx = 0; itemIdx < v.__value._row.length; itemIdx++) {
        const item = v.__value._row[itemIdx];
        if (item._children) {
          const childLabel = item._children._label || '';
          const childValue = item._children._value || '';
          const childPath = item._children._key || childLabel;
          const invalidStyle = getInvalidStyle(item._children, childPath, basePath, invalidFields, invalidComponents);
          customParts.push(`<div idx="13" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${childLabel}:</strong> ${childValue}</div>`);
        } else if (item._row && Array.isArray(item._row)) {
          for (let cellIdx = 0; cellIdx < item._row.length; cellIdx++) {
            const cell = item._row[cellIdx];
            if (cell._children) {
              const cellLabel = cell._children._label || '';
              const cellValue = cell._children._value || '';
              const cellPath = cell._children._key || cellLabel;
              const invalidStyle = getInvalidStyle(cell._children, cellPath, basePath, invalidFields, invalidComponents);
              customParts.push(`<div idx="14" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${invalidStyle}">${cellLabel}:</strong> ${cellValue}</div>`);
            }
          }
        }
      }
      customChildrenHtml = customParts.join('');
    }

    return `
      <div idx="15" style="padding-left:10px; margin-left:0px; border-left:1px dotted #ccc;">
        <strong style="${getInvalidStyle(v.__comp, k, basePath, invalidFields, invalidComponents)}">${containerLabel}</strong>
        <div idx="16" style="padding-left: 10px;">
          ${customChildrenHtml || panelChildrenHtml}
        </div>
      </div>
    `;
  } else {
    if (depth >= 1) {
      pad += `margin-left: 10px;`;
    }
    return `
      <div idx="17" style="${pad}">
        ${panelChildrenHtml}
      </div>
    `;
  }
}

/**
 * Renders data grid rows
 */
function renderDataGridRows(v, k, depth, rootInstance, invalidFields, basePath, header, invalidComponents = new Set()) {
  // Battery optimization: Build presentKeys more efficiently
  const presentKeys = new Set();
  for (const rowKey in v.__rows) {
    if (v.__rows.hasOwnProperty(rowKey)) {
      const r = v.__rows[rowKey];
      if (r.__children) {
        for (const cKey in r.__children) {
          if (r.__children.hasOwnProperty(cKey)) {
            presentKeys.add(cKey);
          }
        }
      }
    }
  }

  // Battery optimization: Build orderedKeys more efficiently
  let orderedKeys = [];
  if (Array.isArray(v.__colKeys) && v.__colKeys.length) {
    for (let i = 0; i < v.__colKeys.length; i++) {
      const cKey = v.__colKeys[i];
      if (presentKeys.has(cKey)) {
        orderedKeys.push(cKey);
      }
    }
  } else {
    orderedKeys = Array.from(presentKeys);
  }

  // Battery optimization: Build labelByKey more efficiently
  const labelByKey = new Map();
  if (Array.isArray(v.__colKeys)) {
    for (let i = 0; i < v.__colKeys.length; i++) {
      const cKey = v.__colKeys[i];
      labelByKey.set(cKey, (v.__colLabels && v.__colLabels[i]) || cKey);
    }
  }
  
  // Battery optimization: Build rowIdxs more efficiently
  const rowIdxs = [];
  for (const n in v.__rows) {
    if (v.__rows.hasOwnProperty(n)) {
      rowIdxs.push(Number(n));
    }
  }
  rowIdxs.sort((a, b) => a - b);
  
  const rowsParts = [];
  for (let idx = 0; idx < rowIdxs.length; idx++) {
    const rowIdx = rowIdxs[idx];
    const row = v.__rows[rowIdx];
    const haveMultiCols = orderedKeys.length > 1;
    const rowHasErrors = isRowInvalid(row, k, rowIdx, invalidFields, invalidComponents);
    const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

    const padRow = `padding-left:10px; border-left:1px dotted #ccc;`;
    const padCol = `padding-left:10px; border-left:1px dotted #ccc;`;

    if (haveMultiCols) {
      const processedInThisRow = new Set();
      const colsParts = ['<div idx="19" style="padding-left: 10px;">'];
      
      // Battery optimization: Use for loop instead of map
      for (let colIdx = 0; colIdx < orderedKeys.length; colIdx++) {
        const colKey = orderedKeys[colIdx];
        if (processedInThisRow.has(colKey)) {
          continue;
        }

        processedInThisRow.add(colKey);
        const cell = row.__children[colKey];
        if (!cell) continue;
        
        let cellContent = '';

        if (cell.__leaf || (v?.__rows && v?.__rows?.length > 0)) {
          const val = firstLeafVal(cell);
          const cellPath = `${k}[${rowIdx}].${colKey}`;
          const invalidStyle = getInvalidStyle(cell.__comp, cellPath, `${k}[${rowIdx}]`, invalidFields, invalidComponents);
          
          if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
            // Battery optimization: Use cached regex
            const textareaContent = val.replace(regexPatterns.textareaMarker, '');
            cellContent = `<div idx="20" style="${padCol}">
                            <strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong><br/>
                            ${textareaContent}
                          </div>`;
          } else {
            cellContent = `<div idx="21" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
          }
        } else {
          let cellHasChildren = false;
          if (cell?.__children) {
            for (const key in cell.__children) {
              if (cell.__children.hasOwnProperty(key)) {
                cellHasChildren = true;
                break;
              }
            }
          }
          
          let nestedHtml = '';
          if (cellHasChildren) {
            nestedHtml = renderNode(cell.__children, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${colKey}`, invalidComponents, true);
          }
          
          const hasNestedContent = nestedHtml && nestedHtml.trim().length > 0;
          const directVal = cell?.__value !== undefined ? formatValue(cell.__value, cell.__comp) : firstLeafVal(cell);
          const cellPath = `${k}[${rowIdx}].${colKey}`;
          const invalidStyle = getInvalidStyle(cell.__comp, cellPath, `${k}[${rowIdx}]`, invalidFields, invalidComponents);
          
          if (hasNestedContent) {
            cellContent = `<div idx="23" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>${nestedHtml}`;
          } else if (directVal) {
            cellContent = `<div idx="22" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${directVal}</div>`;
          } else {
            cellContent = `<div idx="24" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>`;
          }
        }
        if (cellContent) colsParts.push(cellContent);
      }
      colsParts.push('</div>');

      rowsParts.push(`<li style="margin-left:15 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${colsParts.join('')}</li>`);
    } else {
      const onlyKey = orderedKeys[0];
      const cell = row.__children[onlyKey];
      const cellPath = `${k}[${rowIdx}].${onlyKey}`;
      // Check if this cell is invalid using the full path
      const cellIsInvalid = isFieldInvalid(cell.__comp, cellPath, invalidFields) || 
                           (cell.__comp && invalidComponents.has(cell.__comp)) ||
                           invalidFields.has(cellPath);
      const invalidStyle = getInvalidStyle(cell.__comp, cellPath, `${k}[${rowIdx}]`, invalidFields, invalidComponents);
      const val = cell?.__leaf ? firstLeafVal(cell) : null;
      let inner = '';
      if (cell?.__leaf) {
        if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
          // Battery optimization: Use cached regex
          const textareaContent = val.replace(regexPatterns.textareaMarker, '');
          inner = `<div idx="21" style="${padRow}">
                     <strong style="${invalidStyle}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong><br/>
                     ${textareaContent}
                   </div>`;
        } else {
          inner = `<div idx="21" style="${padRow}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${val}</div>`;
        }
      } else {
        inner = renderNode(cell?.__children || {}, depth + 1, rootInstance, invalidFields, cellPath, invalidComponents, true);
      }
      rowsParts.push(`<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${inner}</li>`);
    }
  }
  
  const rowsHtml = rowsParts.join('');

  return `${header}<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${rowsHtml}</ul></div>`;
}

/**
 * Checks if a row is invalid
 */
function isRowInvalid(row, datagridKey, rowIdx, invalidFields, invalidComponents = new Set()) {
  if (!row.__children) return false;

  const hasDirectInvalid = Object.keys(row.__children).some(colKey => {
    const cell = row.__children[colKey];
    const cellPath = `${datagridKey}[${rowIdx}].${colKey}`;
    const isInvalid = isFieldInvalid(cell.__comp, cellPath, invalidFields) || invalidComponents.has(cell.__comp);
    return isInvalid;
  });

  if (hasDirectInvalid) {
    return true;
  }

  const hasNestedInvalid = Object.keys(row.__children).some(colKey => {
    const cell = row.__children[colKey];
    const cellPath = `${datagridKey}[${rowIdx}].${colKey}`;
    const isNestedInvalid = isRowInvalidRecursive(cell, cellPath, invalidFields, invalidComponents);
    return isNestedInvalid;
  });

  if (hasNestedInvalid) {
    return true;
  }

  return false;
}

/**
 * Recursively checks if a row is invalid
 */
function isRowInvalidRecursive(node, currentPath, invalidFields, invalidComponents = new Set()) {
  // Battery optimization: Check Set.has first (fastest)
  if (node.__comp && (invalidComponents.has(node.__comp) || invalidFields.has(currentPath))) {
    return true;
  }
  if (node.__comp && isFieldInvalid(node.__comp, currentPath, invalidFields)) {
    return true;
  }

  if (node.__children) {
    // Battery optimization: Use for...in instead of Object.keys().some()
    for (const childKey in node.__children) {
      if (node.__children.hasOwnProperty(childKey)) {
        const childNode = node.__children[childKey];
        const childPath = `${currentPath}.${childKey}`;
        const isChildInvalid = isRowInvalidRecursive(childNode, childPath, invalidFields, invalidComponents);
        if (isChildInvalid) {
          return true;
        }
      }
    }
  }

  return false;
}
