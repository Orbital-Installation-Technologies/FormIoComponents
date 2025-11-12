/**
 * Data processing helpers for ReviewButton component
 * Contains logic for collecting, processing, and organizing form data for review display
 */

import { isContainerType, shouldFlattenContainer } from "./validationUtils.js";

/**
 * Checks if a component is invalid based on the invalid fields set
 */
function isComponentInvalid(comp, invalidFields) {
  if (!invalidFields || invalidFields.size === 0) return false;
  
  const componentPath = comp.path || comp.key || comp.component?.key;
  if (!componentPath) return false;
  
  // Check exact path match
  if (invalidFields.has(componentPath)) return true;
  
  // Check various path formats
  const pathsToCheck = [
    componentPath,
    `form.data.${componentPath}`,
    `data.${componentPath}`,
    `form.${componentPath}`,
    componentPath.replace('form.data.', ''),
    componentPath.replace('data.', ''),
    componentPath.replace('form.', '')
  ];
  
  for (const path of pathsToCheck) {
    if (invalidFields.has(path)) return true;
  }
  
  // For array fields, check if any invalid field matches the same array index and field name
  if (componentPath.includes('[') && componentPath.includes(']')) {
    const fieldName = componentPath.split('.').pop();
    const arrayMatch = componentPath.match(/(\w+\[\d+\])/);
    
    if (arrayMatch) {
      const arrayPart = arrayMatch[1];
      
      for (const invalidField of invalidFields) {
        if (invalidField.includes(arrayPart) && 
            (invalidField.endsWith('.' + fieldName) || invalidField === fieldName)) {
          return true;
        }
      }
    }
  } else {
    // For non-array fields, check if any invalid field ends with this field name
    const fieldName = componentPath.split('.').pop();
    
    for (const invalidField of invalidFields) {
      // Only match if the invalid field doesn't contain array notation
      if (!invalidField.includes('[') && !invalidField.includes(']')) {
        if (invalidField.endsWith('.' + fieldName) || invalidField === fieldName) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Finds a component by its key in the form hierarchy
 */
export function findComponentByKey(root, targetKey, currentPath = '', parent = null) {
  if (!root || !targetKey) return null;

  const currentKey = root.key || root.component?.key;
  if (currentKey === targetKey) {
    return { component: root, path: currentPath, parent };
  }

  const buildPath = (base, keyOrIndex) => base ? `${base}.${keyOrIndex}` : `${keyOrIndex}`;

  if (Array.isArray(root.components)) {
    for (const child of root.components) {
      if (child) {
        const path = buildPath(currentPath, child.key || child.component?.key || root.components.indexOf(child));
        const found = findComponentByKey(child, targetKey, path, root);
        if (found) return found;
      }
    }
  }

  if (root.subForm && typeof root.subForm === 'object') {
    const path = buildPath(currentPath, 'subForm');
    const found = findComponentByKey(root.subForm, targetKey, path, root);
    if (found) return found;
  }

  if (Array.isArray(root.editRows)) {
    for (let i = 0; i < root.editRows.length; i++) {
      const row = root.editRows[i];
      if (row && Array.isArray(row.components)) {
        for (let j = 0; j < row.components.length; j++) {
          const child = row.components[j];
          if (child) {
            const path = buildPath(currentPath, `[${i}].${child.key || child.component?.key || j}`);
            const found = findComponentByKey(child, targetKey, path, row);
            if (found) return found;
          }
        }
      }
    }
  }

  if (Array.isArray(root.editForms)) {
    for (let i = 0; i < root.editForms.length; i++) {
      const form = root.editForms[i];
      if (form) {
        const path = buildPath(currentPath, `[${i}]`);
        const found = findComponentByKey(form, targetKey, path, root);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Creates a custom component structure for review display
 */
export function createCustomComponentForReview(component, invalidFields = new Set()) {
  if (!component) return null;
  
  const label = component.component?.label || component.label || component.key || 'Unnamed';
  const key = component.component?.key || component.key;
  const componentType = component.component?.type || component.type;
  const data = component.data || component._data || component.dataValue || {};
  const rootInstance = component.root || component.parent?.root || null;

  if (componentType === 'table' || componentType === 'datatable') {
    const colDefs = Array.isArray(component.components) ? component.components : [];
    const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
    const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

    let dataRows = [];
    if (Array.isArray(component.table) && component.table.length > 0 && Array.isArray(component.table[0])) {
      dataRows = component.table.map(rowArr => {
        const rowObj = {};
        columnKeys.forEach((colKey, idx) => {
          rowObj[colKey] = rowArr[idx];
        });
        return rowObj;
      });
    } else {
      dataRows = Array.isArray(component.dataValue) ? component.dataValue :
        Array.isArray(component.rows) ? component.rows :
          Array.isArray(component.savedRows) ? component.savedRows.map(row => row.data || {}) :
            Array.isArray(rootInstance?.data?.[key]) ? rootInstance.data[key] :
              Array.isArray(component._data?.[key]) ? component._data[key] : [];
    }

    // Transpose: Each field becomes a row, each data row becomes a column
    const tableRows = [];
    
    colDefs.forEach((col, colIdx) => {
      const colKey = col.key || col.component?.key;
      const colLabel = columnLabels[colIdx] || colKey;

      if (!colKey) return;

      const rowData = [];
      
      // For each data row, create a column entry containing the field value
      dataRows.forEach((rowObj, dataRowIdx) => {
        const val = typeof rowObj === 'object' ? rowObj[colKey] : '';
        rowData.push({
          _children: {
            _label: `Row ${dataRowIdx + 1}`,
            _key: `${colKey}_row_${dataRowIdx}`,
            _type: col.type || col.component?.type,
            _leaf: true,
            _value: val
          }
        });
      });

      // Create a table row for this field
      tableRows.push({ 
        _row: rowData,
        _fieldLabel: colLabel,
        _fieldKey: colKey
      });
    });
    
    return {
      _label: label,
      _key: key,
      _type: componentType,
      _row: tableRows
    };
  } else if (isContainerType(componentType)) {
    const children = component.components || [];
    
    if (shouldFlattenContainer(componentType)) {
      const childItems = children.filter(child => {
        if (child?.component?.hidden === true || child?.hidden === true) {
          return false;
        }
        
        if (child?.disabled === true || child?.component?.disabled === true) {
          return child?.component?.reviewVisible === true;
        }
        
        const isRequired = child?.component?.validate?.required === true;
        const isReviewVisible = child?.component?.reviewVisible === true;
        const isInvalid = isComponentInvalid(child, invalidFields);
        
        if (isRequired && !isInvalid && !isReviewVisible) {
          return false;
        }
        
        return isReviewVisible || isRequired;
      })
      .map(child => {
        const childKey = child.key || child.path || '';
        const childValue = child.dataValue || (data[childKey] || '');
        return {
          _label: child.label || child.key || 'Unnamed',
          _key: childKey,
          _type: child.type || child.component?.type,
          _leaf: true,
          _value: childValue
        };
      });
      
      return childItems.length > 0 ? childItems : null;
    }
    
    const containerItems = children.filter(child => {
      if (child?.component?.hidden === true || child?.hidden === true) {
        return false;
      }
      
      if (child?.disabled === true || child?.component?.disabled === true) {
        return child?.component?.reviewVisible === true;
      }
      
      const isRequired = child?.component?.validate?.required === true;
      const isReviewVisible = child?.component?.reviewVisible === true;
      const isInvalid = isComponentInvalid(child, invalidFields);
      
      if (isRequired && !isInvalid && !isReviewVisible) {
        return false;
      }
      
      return isReviewVisible || isRequired;
    }) 
    .map(child => {
      const childKey = child.key || child.path || '';
      const childValue = child.dataValue || (data[childKey] || '');
      return {
        _children: {
          _label: child.label || child.key || 'Unnamed',
          _key: childKey,
          _type: child.type || child.component?.type,
          _leaf: true,
          _value: childValue
        }
      };
    });
    return {
      _label: label,
      _key: key,
      _type: componentType,
      _row: containerItems
    };
  }
  return {
    _label: label,
    _key: key,
    _type: componentType,
    _leaf: true,
    _value: component.dataValue || ''
  };
}

/**
 * Collects all review leaves and labels from the form
 */
export async function collectReviewLeavesAndLabels(root, invalidFields = new Set()) {
  const stats = {
    leafComponents: 0,
    containers: 0
  };

  const pushedPaths = new Set();
  
  const canon = (p = '') => {
    let normalized = p
      .replace(/^form\./, '')
      .replace(/^submission\./, '')
      .replace(/(^|\.)data(\.|$)/g, '$1')
      .replace(/\.data\./g, '.')
      .replace(/^\d+\./, '')     // Remove leading array indices
      .replace(/\.\d+\./g, '.'); // Remove intermediate array indices

    if (normalized.includes('[')) {
      const matches = normalized.match(/^(.+?)(\[\d+\].*)$/);
      if (matches) {
        const basePath = matches[1];
        const arrayPart = matches[2];
        normalized = `${basePath}${arrayPart}`;
      }
    }

    return normalized;
  };

  const pushLeaf = (leaf) => {
    const norm = canon(leaf.path);
    if (!norm || pushedPaths.has(norm)) return;
    pushedPaths.add(norm);
    leaves.push(leaf);
  };

  const topIndexMap = new Map();
  if (Array.isArray(root?.components)) {
    root.components.forEach((c, i) => {
      const k = c?.component?.key || c?.key;
      if (k) topIndexMap.set(k, i);
    });
  }
  const topIndexFor = (comp) => {
    let p = comp;
    while (p?.parent && p.parent !== root) p = p.parent;
    const topKey = p?.component?.key || p?.key;
    return topIndexMap.has(topKey) ? topIndexMap.get(topKey) : -1;
  };

  if (root.ready) await root.ready;
  let leaves = [];
  const labelByPathMap = new Map();
  const metaByPathMap = new Map();
  const indexByPathMap = new Map();
  const suppressLabelForKey = new Set(['data']);
  const queue = [];
  const processedPaths = new Set();

  const enqueueAll = (f) => {
    if (!f || !f.everyComponent) {
      return;
    }
    const prefix = f.__reviewPrefix || '';

    f.everyComponent((c) => {
      const shouldSkip = c.parent && (isContainerType(c.parent.component?.type));
      if (shouldSkip) {
        return;
      }
      if (prefix) c.__prefix = prefix;
      queue.push(c);
    });
  };

  const safePath = (c) => (c?.__reviewPath) || (c?.__prefix ? `${c.__prefix}${c.path}` : c?.path);

  enqueueAll(root);

  while (queue.length) {
    const comp = queue.shift();
    if (!comp) continue;

    const isAddressComponentEarly = comp.component?.type === 'address' || comp.type === 'address';
    const isEditGridComponentEarly = comp.component?.type === 'editgrid' || comp.type === 'editgrid';
    
    // New visibility logic:
    // 1. If component is hidden, don't show it
    // 2. If component is disabled, only show if marked review visible
    // 3. If component is required, show it (will be filtered later based on validity)
    // 4. If component is marked review visible, show it
    // 5. Otherwise, don't show it
    
    if (comp?.component?.hidden === true || comp?.hidden === true) {
      continue;
    }
    
    if (comp?.disabled === true || comp?.component?.disabled === true) {
      if (comp?.component?.reviewVisible !== true) {
        continue;
      }
    }
    
    const isRequired = comp?.component?.validate?.required === true;
    const isReviewVisible = comp?.component?.reviewVisible === true;
    const isInvalid = isComponentInvalid(comp, invalidFields);
    
    // Show required fields only if they are invalid or marked review visible
    if (isRequired && !isInvalid && !isReviewVisible) {
      continue;
    }
    
    if (!isRequired && !isReviewVisible && !isAddressComponentEarly && !isEditGridComponentEarly) {
      continue;
    }

    if (comp.type === 'button' || comp.component?.type === 'button') continue;

    // Handle different component types
    if (comp.component?.type === 'datamap') {
      handleDataMapComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap);
      continue;
    }

    if (comp.component?.type === 'editgrid') {
      handleEditGridComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, metaByPathMap);
      continue;
    }

    if (comp.type === 'form') {
      handleFormComponent(comp, safePath, topIndexFor, indexByPathMap, enqueueAll);
      continue;
    }

    if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
      handleDataGridComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, metaByPathMap, root);
      continue;
    }

    if (comp.component?.type === 'table') {
      handleTableComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, createCustomComponentForReview, pushedPaths, canon, invalidFields);
      continue;
    }

    if (comp.component?.type === 'tagpad') {
      handleTagpadComponent(comp, safePath, topIndexFor, leaves, indexByPathMap);
      continue;
    }

    // Handle container components
    if (Array.isArray(comp.components) && comp.components.length) {
      handleContainerComponent(comp, safePath, topIndexFor, indexByPathMap, queue, isContainerType, shouldFlattenContainer);
      continue;
    }

    // Handle leaf components
    handleLeafComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, isContainerType, shouldFlattenContainer, createCustomComponentForReview, invalidFields, leaves, queue, processedPaths);
  }

  // Process remaining components
  processRemainingComponents(root, safePath, topIndexFor, pushLeaf, indexByPathMap, isContainerType, shouldFlattenContainer, leaves, invalidFields);

  const labelByPath = {};
  labelByPathMap.forEach((value, key) => {
    labelByPath[key] = value;
  });
  const metaByPath = {};
  metaByPathMap.forEach((value, key) => {
    metaByPath[key] = value;
  });
  const indexByPath = {};
  indexByPathMap.forEach((value, key) => {
    indexByPath[key] = value;
  });

  stats.leafComponents = leaves.length;
  stats.containers = labelByPathMap.size;

  return { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath };
}

// Helper functions for different component types
function handleDataMapComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap) {
  const dataMapPath = safePath(comp);
  indexByPathMap.set(dataMapPath, topIndexFor(comp));

  if (Array.isArray(comp.rows) && comp.rows.length) {
    comp.rows.forEach((row, rIdx) => {
      const keyComp = row.__key;
      const valueComp = row.value;

      const key = keyComp ? (keyComp.getValue ? keyComp.getValue() : keyComp.dataValue) : '';
      const value = valueComp ? (valueComp.getValue ? valueComp.getValue() : valueComp.dataValue) : '';
      if (!key) return;
      pushLeaf({
        comp: keyComp,
        path: `${dataMapPath}[${rIdx}].key`,
        label: key,
        value: value,
        formIndex: topIndexFor(comp)
      });
    });
  }
}

function handleEditGridComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, metaByPathMap) {
  const gridPath = safePath(comp);
  indexByPathMap.set(gridPath, topIndexFor(comp));

  let colDefs = Array.isArray(comp.components) ? comp.components : [];
  const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
  const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

  const editgridMeta = {
    kind: 'editgrid',
    columnKeys,
    columnLabels
  };
  metaByPathMap.set(gridPath, editgridMeta);

  pushLeaf({
    comp: comp,
    path: gridPath,
    label: comp.component?.label || comp.label || comp.key || 'Edit Grid',
    value: Array.isArray(comp.editRows) ? `${comp.editRows.length} row(s)` : 'No data entered',
    formIndex: topIndexFor(comp)
  });

  if (Array.isArray(comp.editRows) && comp.editRows.length) {
    comp.editRows.forEach((r, rIdx) => {
      (r.components || []).forEach((ch) => {
        let value = null;
        if ('getValue' in ch && typeof ch.getValue === 'function') {
          value = ch.getValue();
        } else if (ch.dataValue !== undefined) {
          value = ch.dataValue;
        } else if (ch.value !== undefined) {
          value = ch.value;
        }

        const chPath = `${gridPath}[${rIdx}].${ch.key || 'Missing Value 4'}`;
        pushLeaf({
          comp: comp,
          path: chPath,
          label: ch.component?.label || ch.label || ch.key || 'Missing Value 4',
          value: value,
          formIndex: topIndexFor(comp)
        });
      });
    });
  }
}

async function handleFormComponent(comp, safePath, topIndexFor, indexByPathMap, enqueueAll) {
  if (comp.subFormReady) await comp.subFormReady;

  const formContainerPath = safePath(comp);
  indexByPathMap.set(formContainerPath, topIndexFor(comp));

  if (comp.subForm) {
    comp.subForm.__reviewPrefix = comp.path ? `${formContainerPath}.` : '';
    enqueueAll(comp.subForm);
  } else {
    if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
      indexByPathMap.set(comp.path, topIndexFor(comp));
    } else {
      indexByPathMap.set(comp.path, topIndexFor(comp));
    }
  }
}

function handleDataGridComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, metaByPathMap, root) {
  const gridPath = safePath(comp);
  indexByPathMap.set(gridPath, topIndexFor(comp));

  let colDefs = Array.isArray(comp.components) ? comp.components : [];
  const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
  const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

  const pushValueLeaf = (node, basePath) => {
    pushLeaf({
      comp: node,
      path: basePath,
      label: node.component?.label || node.label || node.key || 'Missing Value 1',
      value: ('getValue' in node) ? node.getValue() : node.dataValue,
      formIndex: topIndexFor(node)
    });
  };

  const flattenCell = (node, basePath) => {
    if (!node) return;
    const t = node.component?.type || node.type;

    if (t === 'form' && node.subForm) {
      node.subForm.__reviewPrefix = `${basePath}.`;
      node.subForm.everyComponent?.((ch) => {
        const chPath = `${basePath}.${ch.path || ch.key || 'Missing Value 2'}`;
        if (isContainerType(ch.component?.type || ch.type)) {
          flattenCell(ch, chPath);
        } else {
          pushValueLeaf(ch, chPath);
        }
      });
      return;
    }

    if (t === 'columns' && Array.isArray(node.columns)) {
      node.columns.forEach((col, ci) => {
        (col.components || []).forEach((ch) => {
          const chPath = `${basePath}.${ch.key || ch.path || `col${ci}`}`;
          flattenCell(ch, chPath);
        });
      });
      return;
    }

    if (isContainerType(t) && Array.isArray(node.components)) {
      node.components.forEach((ch) => {
        const chPath = `${basePath}.${ch.key || ch.path || 'Missing Value 3'}`;
        flattenCell(ch, chPath);
      });
      return;
    }

    pushValueLeaf(node, basePath);
  };

  const datagridMeta = {
    kind: comp.component?.type,
    columnKeys,
    columnLabels
  };
  metaByPathMap.set(gridPath, datagridMeta);

  if (comp.component?.type === 'datatable') {
    const dataRows =
      Array.isArray(comp.dataValue) ? comp.dataValue :
        Array.isArray(root?.data?.[comp.key]) ? root.data[comp.key] :
          Array.isArray(comp._data?.[comp.key]) ? comp._data[comp.key] : [];

    if (dataRows.length > 0) {
      const processedFields = new Map();
      dataRows.forEach((rowObj, rIdx) => {
        if (!processedFields.has(rIdx)) processedFields.set(rIdx, new Set());
        const rowDone = processedFields.get(rIdx);
        colDefs.forEach((c, i) => {
          const cKey = c.key || c.component?.key || c.path;
          const cLabel = columnLabels[i] || cKey;
          if (!cKey || rowDone.has(cKey)) return;
          const val = rowObj?.[cKey];
          pushLeaf({
            comp: comp,
            path: `${gridPath}[${rIdx}].${cKey}`,
            label: cLabel,
            value: val,
            formIndex: topIndexFor(comp)
          });
          rowDone.add(cKey);
        });
      });
    } else {
      // Push a leaf for empty datatables so they appear in the review
      pushLeaf({
        comp: comp,
        path: gridPath,
        label: comp.component?.label || comp.label || comp.key || 'Data Table',
        formIndex: topIndexFor(comp)
      });
    }
    return;
  }

  if (Array.isArray(comp.rows) && comp.rows.length) {
    comp.rows.forEach((row, rIdx) => {
      Object.entries(row).forEach(([colKey, cellComp]) => {
        const base = `${gridPath}[${rIdx}].${colKey}`;
        flattenCell(cellComp, base);
      });
    });
  } else {
    // Push a leaf for empty datagrids so they appear in the review
    pushLeaf({
      comp: comp,
      path: gridPath,
      label: comp.component?.label || comp.label || comp.key || 'Data Grid',
      formIndex: topIndexFor(comp)
    });
  }
}

function handleTableComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, createCustomComponentForReview, pushedPaths, canon, invalidFields) {
  const tablePath = safePath(comp) || comp.key;
  indexByPathMap.set(tablePath, topIndexFor(comp));

  if (!pushedPaths.has(canon(tablePath))) {
    pushLeaf({
      comp: comp,
      path: tablePath,
      label: comp.component?.label || comp.label || comp.key || 'Table',
      value: createCustomComponentForReview(comp, invalidFields),
      formIndex: topIndexFor(comp)
    });
  }
  if (Array.isArray(comp.components)) {
    comp.components.forEach(child => {
      const childKey = child.key || child.path || '';
      const childPath = `${tablePath}.${childKey}`;
      indexByPathMap.set(childPath, topIndexFor(comp));
      if (!pushedPaths.has(canon(childPath))) {
        pushLeaf({
          comp: child,
          path: childPath,
          label: child.component?.label || child.label || childKey,
          value: ('getValue' in child) ? child.getValue() : child.dataValue,
          formIndex: topIndexFor(comp)
        });
      }
    });
  }
}

function handleTagpadComponent(comp, safePath, topIndexFor, leaves, indexByPathMap) {
  const tagpadPath = safePath(comp);

  const forms = Array.isArray(comp.editForms) ? comp.editForms : [];
  const tagpadArray = Array.isArray(comp._data?.tagpad) ? comp._data.tagpad : [];

  const formIndex = topIndexFor(comp);

  if (forms.length === 0) {
    leaves.push({
      comp: comp,
      path: `${tagpadPath}[0]`,
      label: 'Tag 1',
      value: {},
      formIndex: formIndex
    });
  } else {
    forms.forEach((form, idx) => {
      const basePath = `${tagpadPath}[${idx}]`;
      const formLabel = `Tag ${idx + 1}`;
      indexByPathMap.set(basePath, formIndex);

      const formData = (form && form.data) ? form.data : (tagpadArray[idx] || {});
      const formComps = Array.isArray(form?.components) ? form.components : [];

      if (formComps.length === 0) {
        leaves.push({
          comp: form || comp,
          path: basePath,
          label: formLabel,
          value: formData || {},
          formIndex: formIndex
        });
      } else {
        formComps.forEach((ch) => {
          const key =
            ch?.key ||
            ch?.path ||
            ch?.component?.key;
          if (!key) return;

          let val = (formData && Object.prototype.hasOwnProperty.call(formData, key))
            ? formData[key]
            : ('getValue' in ch ? ch.getValue() : (ch.dataValue ?? ''));

          leaves.push({
            comp: ch,
            path: `${basePath}.${key}`,
            label: ch.component?.label || ch.label || key,
            value: val,
            formIndex: formIndex
          });
        });
      }
    });
  }
}

function handleContainerComponent(comp, safePath, topIndexFor, indexByPathMap, queue, isContainerType, shouldFlattenContainer) {
  const containerPath = safePath(comp);
  const componentType = comp.type || comp.component?.type;

  const isContainer = isContainerType([comp.type, comp.component?.type]);

  if (shouldFlattenContainer(componentType)) {
    comp.components.forEach((ch) => queue.push(ch));
    return;
  }

  if (isContainer) {
    if (!comp.component) {
      comp.component = {};
    }
  }

  indexByPathMap.set(containerPath, topIndexFor(comp));
  comp.components.forEach((ch) => queue.push(ch));
}

function handleLeafComponent(comp, safePath, topIndexFor, pushLeaf, indexByPathMap, isContainerType, shouldFlattenContainer, createCustomComponentForReview, invalidFields, leaves, queue, processedPaths) {
  const parent = comp?.parent;
  const parentType = parent?.component?.type;
  const parentsToBeHandled = ['datatable', 'datagrid', 'tagpad', 'datamap', 
                              'panel', 'well', 'table', 'tabs', 'fieldset', 'columns'];
  const parentIsHandled = parentsToBeHandled.includes(parentType) && 
                          !shouldFlattenContainer(parentType);

  const isInTagpadForm =
    parent && parentType === 'tagpad' &&
    comp.__reviewPath && comp.__reviewPath.includes('[') && comp.__reviewPath.includes(']');

  const isTagpadComponent = comp.type === 'tagpad' || comp.component?.type === 'tagpad' || isInTagpadForm;

  const isContentComponent = comp?.type === 'content' || comp?.component?.type === 'content' ||
                             comp?.type === 'htmlelement' || comp?.component?.type === 'htmlelement';

  const componentPath = safePath(comp);
  const pathParts = (componentPath || '').split('.');
  const hasArrayNotation = componentPath && componentPath.includes('[') && componentPath.includes(']');
  const isGridChild = hasArrayNotation || pathParts.some(part => /^\d+$/.test(part));

  const isFormComponent = comp.type === 'form' || comp.component?.type === 'form';
  const isPanelComponent = comp.type === 'panel' || comp.component?.type === 'panel';
  const componentType = comp.component?.type || comp.type;

  if (shouldFlattenContainer(componentType)) {
    return;
  }

  if (isPanelComponent) {
    const panelPath = safePath(comp);
    indexByPathMap.set(panelPath, topIndexFor(comp));

    if (!comp.component) {
      comp.component = {};
    }

    if (Array.isArray(comp.components) && comp.components.length > 0) {
      comp.components.forEach(child => {
        if (!child.component) {
          child.component = {};
        }
      });
    }
  }

  const isContainerComponent = isContainerType([comp.type, comp.component?.type]);

  if (comp.component?.type === 'well' || comp.type === 'well' ||
    comp.component?.type === 'table' || comp.type === 'table') {
    createCustomComponentForReview(comp, invalidFields);
  }
  
  if (isPanelComponent || isContainerComponent) {
    if (!comp.component) comp.component = {};
    comp.component.reviewVisible = true;

    if (comp.components && comp.components.length > 0) {
      const processedContainer = createCustomComponentForReview(comp, invalidFields);
      
      if (processedContainer) {
        leaves.push(processedContainer);
      }
      
      comp.components.forEach(childComp => {
        if (childComp) {
          const childPath = safePath(childComp);
          if (!processedPaths.has(childPath)) {
            processedPaths.add(childPath);
            queue.push(childComp);
          }
        }
      });
    }
  }

  const isAddressComponentMain = comp.component?.type === 'address' || comp.type === 'address';

  if (
    !parentIsHandled &&
    !isContentComponent &&
    !isGridChild &&
    comp.visible !== false &&
    !(comp?.component?.hidden === true || comp?.hidden === true) &&
    (
      comp.component?.reviewVisible === true ||
      (comp?.component.validate?.required === true && isComponentInvalid(comp, invalidFields)) ||
      isTagpadComponent || isFormComponent || isPanelComponent || isContainerComponent || isAddressComponentMain ||
      (comp?.disabled === true && comp?.component?.reviewVisible === true)
    )
  ) {
    let componentValue;
    if (isFormComponent) {
      componentValue = comp.data || comp.submission?.data || comp.dataValue || {};
    } else if (isPanelComponent || isContainerComponent) {
      const customStructure = createCustomComponentForReview(comp, invalidFields);
      componentValue = customStructure;
    } else {
      componentValue = ('getValue' in comp) ? comp.getValue() : comp.dataValue;
    }

    if (isAddressComponentMain) {
      componentValue = comp.dataValue?.formattedPlace || "";
    }

    pushLeaf({
      comp: comp,
      path: comp.__reviewPath || safePath(comp) || comp.key,
      label: comp.component?.label || comp.key,
      value: componentValue,
      formIndex: topIndexFor(comp),
      customStructure: (isPanelComponent && !shouldFlattenContainer([comp.type, comp.component?.type])) || 
                       (isContainerComponent && !shouldFlattenContainer([comp.type, comp.component?.type])) ? true : false
    });
  }
}

function processRemainingComponents(root, safePath, topIndexFor, pushLeaf, indexByPathMap, isContainerType, shouldFlattenContainer, leaves, invalidFields) {
  if (Array.isArray(root?.components)) {
    root.components.forEach(comp => {
      const containerType = comp.component?.type || comp.type;
      const isContainer = isContainerType([comp.type, comp.component?.type], ['table']) &&
                    Array.isArray(comp.components) && comp.components.length > 0;

      if (shouldFlattenContainer(containerType)) {
        return;
      }

      if (isContainer) {
        let panelPath = safePath(comp);

        const panelInLeaves = leaves.some(leaf =>
          (leaf.path === panelPath || leaf.comp === comp)
        );

        if (!panelInLeaves) {
          if (panelPath == "") {
            panelPath = comp.key;
          }

          const panelFormIndex = topIndexFor(comp);
          indexByPathMap.set(panelPath, panelFormIndex);

          const isWell = containerType === 'well';

          pushLeaf({
            comp: comp,
            path: panelPath,
            label: "",
            value: isWell ? '(Well contents)' : '(Panel contents)',
            formIndex: panelFormIndex
          });

          comp.components.forEach(childComp => {
            const childKey = childComp.key || childComp.path || 'child';
            const childPath = `${panelPath}.${childKey}`;
            indexByPathMap.set(childPath, panelFormIndex);

            pushLeaf({
              comp: childComp,
              path: childPath,
              label: childComp.component?.label || childKey,
              value: ('getValue' in childComp) ? childComp.getValue() : childComp.dataValue,
              formIndex: panelFormIndex
            });
          });
        }
      }
    });
  }
}
