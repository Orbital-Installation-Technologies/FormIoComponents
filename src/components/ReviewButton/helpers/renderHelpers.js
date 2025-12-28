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
function renderNode(node, depth = 0, rootInstance = null, invalidFields = new Set(), basePath = '', invalidComponents = new Set()) {
  let pad = `padding-left:10px; border-left:1px dotted #ccc;`;

  const sortedEntries = Object.entries(node).sort((a, b) => {
    const aIsTagpad = a[1]?.__label === 'Tagpad' || a[1]?.__comp?.component?.type === 'tagpad';
    const bIsTagpad = b[1]?.__label === 'Tagpad' || b[1]?.__comp?.component?.type === 'tagpad';

    if (aIsTagpad && bIsTagpad) {
      return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
    }

    if (aIsTagpad) return (a[1]?.__formIndex ?? -1) - (a[1]?.__formIndex ?? 0);
    if (bIsTagpad) return (a[1]?.__formIndex ?? 0) - (b[1]?.__formIndex ?? -1);

    return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
  });

  return sortedEntries.map(([k, v], index) => {
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
        return v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath, invalidComponents) : '';
    }

    if (v && v.__leaf) {
      return renderLeafNode(v, k, depth, basePath, invalidFields, invalidComponents);
    }

    if (v && typeof v === 'object') {
        return renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents);
    }
    return '';
  }).join('');
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

  const processedTreePaths = new Set();

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
    const normalizedPath = path.replace(/\.data\./g, '.')
      .replace(/^data\./, '')
      .replace(/^form\./, '')
      .replace(/^submission\./, '');

    if (processedTreePaths.has(normalizedPath)) {
      continue;
    }

    const isPanelComponent = isParentComponent(comp);
    if (isPanelComponent) {
      panelPaths.add(normalizedPath);
    }

    processedTreePaths.add(normalizedPath);

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
          if (!node.__rows) node.__rows = {};
          node.__rows[idx] ??= { __children: {}, __comp: comp };
          ptr = node.__rows[idx].__children;
        } else if (i === parts.length - 1) {
          const isWellComponent = comp?.component?.type === 'well' || comp?.type === 'well';

          if (isPanelComponent || isWellComponent) {
            ptr[key] = {
              __leaf: false,
              __label: label || key,
              __value: value,
              __comp: comp,
              __formIndex: formIndex,
              __children: {},
              __rows: {},
              __suppress: false,
              __kind: comp.type,
              __colKeys: null,
              __colLabels: null
            };
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
          if (!node.__children) node.__children = {};
          Object.keys(node.__children).forEach(childKey => {
            if (node.__children[childKey] && !node.__children[childKey].__comp) {
              node.__children[childKey].__comp = comp;
            }
          });
          ptr = node.__children;
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

  function renderNode(node, depth = 0, rootInstance = null, invalidFields = new Set(), basePath = '', invalidComponents = new Set()) {
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
      const compPath = v.__comp?.path || v.__comp?.key || v.__comp?.component?.key;
      const compKey = v.__comp?.key || v.__comp?.component?.key;
      const fullPath = basePath ? `${basePath}.${k}` : k;
      
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
        return v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath, invalidComponents) : '';
      }

      if (v && v.__leaf) {
        // For leaf nodes, check if the component's actual path matches an invalid field
        // The leaf path might have extra segments (like .panel.panel1.) that aren't in the invalid field path
        // Check the component's actual path, the rendered key, and also check by component key
        const compPath = v.__comp?.path || v.__comp?.key || v.__comp?.component?.key;
        const compKey = v.__comp?.key || v.__comp?.component?.key;
        
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
        return renderContainerNode(v, k, depth, rootInstance, invalidFields, basePath, pad, invalidComponents);
      }
      return '';
    }).join('');
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
  const compPath = v.__comp?.path || v.__comp?.key || v.__comp?.component?.key;
  const compKey = v.__comp?.key || v.__comp?.component?.key;
  const fullPath = basePath ? `${basePath}.${k}` : k;
  
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
    const textareaContent = val.replace(/__TEXTAREA__/g, '');
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
    const contentItems = Object.entries(formValue)
      .filter(([fieldKey, fieldVal]) => fieldVal !== null && fieldVal !== undefined)
      .map(([fieldKey, fieldVal]) => {
        const displayVal = typeof fieldVal === 'object'
          ? JSON.stringify(fieldVal)
          : String(fieldVal);
        const fieldPath = `${k}.${fieldKey}`;
        return `<div idx="2" depth="${depth}" style="margin-left:10px; padding-left:10px; border-left:1px dotted #ccc;"><strong style="${getInvalidStyle(v.__comp, fieldPath, basePath, invalidFields, invalidComponents)}">${fieldKey}:</strong> ${displayVal}</div>`;
      })
      .join('');
    formContentHtml += contentItems;
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

  const hasChildren = v.__children && Object.keys(v.__children).length;
  const hasRows = v.__rows && Object.keys(v.__rows).length;
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

  const childrenHtml = [
    hasRows
      ? `<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${(() => {
        return Object.entries(v.__rows).map(([i, r]) => {
          const isTagpad = k === 'tagpad' ||
            v.__label === 'Tagpad' ||
            v.__comp?.component?.type === 'tagpad' ||
            v.__comp?.type === 'tagpad';
          const rowLabel = isTagpad ? `Tag ${Number(i) + 1}` : `Row ${Number(i) + 1}`;

          const rowHasErrors = isRowInvalid(r, k, parseInt(i), invalidFields, invalidComponents);
          const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

          const hasChildren = r.__children && Object.keys(r.__children).length;
          const content = hasChildren
            ? renderNode(r.__children, depth + 1, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`, invalidComponents)
            : ``;

          const rowClass = isTagpad ? 'tagpad-row' : 'data-row';

          return `<li class="${rowClass}" style="margin-left:0 !important; padding-left: 0 !important;"><strong style="${rowLabelStyle}">${rowLabel}:</strong>${content}</li>`;
        }).join('');
      })()}</ul>` : '',
    hasChildren ? renderNode(v.__children, depth + 1, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k, invalidComponents) : ''
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
      const transformedEditRows = {};
      
      v.__comp.editRows.forEach((row, rowIdx) => {
        const rowKey = `Row ${rowIdx + 1}`;
        transformedEditRows[rowKey] = {
          __children: {},
          __comp: v.__comp
        };
        
        if (row.components && Array.isArray(row.components)) {
          row.components.forEach(comp => {
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
          });
        }
      });
      
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
      customChildrenHtml = v.__value._row.map(item => {
        if (item._children) {
          const childLabel = item._children._label || '';
          const childValue = item._children._value || '';
          const childPath = item._children._key || childLabel;
          return `<div idx="13" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${getInvalidStyle(item._children, childPath, basePath, invalidFields, invalidComponents)}">${childLabel}:</strong> ${childValue}</div>`;
        } else if (item._row && Array.isArray(item._row)) {
          return item._row.map(cell => {
            if (cell._children) {
              const cellLabel = cell._children._label || '';
              const cellValue = cell._children._value || '';
              const cellPath = cell._children._key || cellLabel;
              return `<div idx="14" style="padding-left:10px; border-left:1px dotted #ccc;"><strong style="${getInvalidStyle(cell._children, cellPath, basePath, invalidFields, invalidComponents)}">${cellLabel}:</strong> ${cellValue}</div>`;
            }
            return '';
          }).join('');
        }
        return '';
      }).join('');
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
  const presentKeys = new Set();
  Object.values(v.__rows).forEach(r => {
    Object.keys(r.__children || {}).forEach(cKey => presentKeys.add(cKey));
  });

  const orderedKeys = Array.isArray(v.__colKeys) && v.__colKeys.length
    ? v.__colKeys.filter(cKey => presentKeys.has(cKey))
    : Array.from(presentKeys);

  const labelByKey = new Map(
    (v.__colKeys || []).map((cKey, i) => [cKey, (v.__colLabels || [])[i] || cKey])
  );
  
  const rowIdxs = Object.keys(v.__rows).map(n => Number(n)).sort((a, b) => a - b);
  let rowsHtml = '';
  const rowsItems = rowIdxs.map((rowIdx) => {
    const row = v.__rows[rowIdx];
    const haveMultiCols = orderedKeys.length > 1;
    const rowHasErrors = isRowInvalid(row, k, rowIdx, invalidFields, invalidComponents);
    const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

    const padRow = `padding-left:10px; border-left:1px dotted #ccc;`;
    const padCol = `padding-left:10px; border-left:1px dotted #ccc;`;

    if (haveMultiCols) {
      const processedInThisRow = new Set();

      let colsHtml = '<div idx="19" style="padding-left: 10px;">';
      const colsItems = orderedKeys.map((colKey, colIdx) => {
        if (processedInThisRow.has(colKey)) {
          return '';
        }

        processedInThisRow.add(colKey);
        const cell = row.__children[colKey];
        let cellContent = '';

        if (cell.__leaf || (v?.__rows && v?.__rows?.length > 0)) {
          const val = firstLeafVal(cell);
          const cellPath = `${k}[${rowIdx}].${colKey}`;
          // Check if this cell is invalid using the full path
          const cellIsInvalid = isFieldInvalid(cell.__comp, cellPath, invalidFields) || 
                               (cell.__comp && invalidComponents.has(cell.__comp)) ||
                               invalidFields.has(cellPath);
          const invalidStyle = getInvalidStyle(cell.__comp, cellPath, `${k}[${rowIdx}]`, invalidFields, invalidComponents);
          
          if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
            const textareaContent = val.replace(/__TEXTAREA__/g, '');
            cellContent = `<div idx="20" style="${padCol}">
                            <strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong><br/>
                            ${textareaContent}
                          </div>`;
          } else {
            cellContent = `<div idx="21" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
          }
        } else {
          const hasChildren = cell?.__children && Object.keys(cell.__children).length > 0;
          let nestedHtml = '';
          
          if (hasChildren) {
            nestedHtml = renderNode(cell.__children, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${colKey}`, invalidComponents);
          }
          
          const hasNestedContent = nestedHtml && nestedHtml.trim().length > 0;
          
          const directVal = cell?.__value !== undefined ? formatValue(cell.__value, cell.__comp) : firstLeafVal(cell);
          const cellPath = `${k}[${rowIdx}].${colKey}`;
          // Check if this cell is invalid using the full path
          const cellIsInvalid = isFieldInvalid(cell.__comp, cellPath, invalidFields) || 
                               (cell.__comp && invalidComponents.has(cell.__comp)) ||
                               invalidFields.has(cellPath);
          const invalidStyle = getInvalidStyle(cell.__comp, cellPath, `${k}[${rowIdx}]`, invalidFields, invalidComponents);
          
          if (hasNestedContent) {
            cellContent = `<div idx="23" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>${nestedHtml}`;
          } else if (directVal) {
            cellContent = `<div idx="22" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${directVal}</div>`;
          } else {
            cellContent = `<div idx="24" style="${padCol}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>`;
          }
        }
        return `${cellContent}`;
      }).filter(html => html.length > 0).join('');
      colsHtml += colsItems;
      colsHtml += '</div>';

      return `<li style="margin-left:15 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${colsHtml}</li>`;
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
      const inner = cell?.__leaf
        ? (val && typeof val === 'string' && val.includes('__TEXTAREA__'))
          ? (() => {
              const textareaContent = val.replace(/__TEXTAREA__/g, '');
              return `<div idx="21" style="${padRow}">
                       <strong style="${invalidStyle}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong><br/>
                       ${textareaContent}
                     </div>`;
            })()
          : `<div idx="21" style="${padRow}"><strong style="${invalidStyle}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${val}</div>`
        : renderNode(cell?.__children || {}, depth + 1, rootInstance, invalidFields, cellPath, invalidComponents);
      return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${inner}</li>`;
    }
  }).join('');
  rowsHtml += rowsItems;

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
  if (node.__comp && (isFieldInvalid(node.__comp, currentPath, invalidFields) || invalidComponents.has(node.__comp))) {
    return true;
  }

  if (node.__children) {
    const hasInvalidChild = Object.keys(node.__children).some(childKey => {
      const childNode = node.__children[childKey];
      const childPath = `${currentPath}.${childKey}`;
      const isChildInvalid = isRowInvalidRecursive(childNode, childPath, invalidFields, invalidComponents);
      return isChildInvalid;
    });
    
    if (hasInvalidChild) {
      return true;
    }
  }

  return false;
}
