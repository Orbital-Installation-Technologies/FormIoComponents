/**
 * UI rendering helpers for ReviewButton component
 * Contains logic for rendering HTML and formatting values for display
 */

/**
 * Formats a value for display based on component type
 */
export function formatValue(value, comp) {
  if (value && (value._type === 'table' || value._type === 'datatable') && (Array.isArray(comp.table) || Array.isArray(comp.dataValue) || Array.isArray(comp.rows))) {
    const customTableForReview = (component, data = {}) => {
      const label = component.label;
      const key = component.key;
      let customTable = null;
      let rowData = [];
      let value = {};
      let column = [];
      let finalTable = {};
      
      let rows = component.table || component.components || component.columns;
      let dataRows = [];
      
      if (component._type === 'datatable' || component.type === 'datatable') {
        dataRows = Array.isArray(component.dataValue) ? component.dataValue :
                  Array.isArray(component.rows) ? component.rows :
                  Array.isArray(component.data) ? component.data :
                  Array.isArray(data[key]) ? data[key] : [];
                  
        if (dataRows.length > 0 && (!rows || rows.length === 0)) {
          const firstRow = dataRows[0];
          if (typeof firstRow === 'object') {
            rows = Object.keys(firstRow).map(k => ({ component: { key: k, label: k, type: 'textfield' } }));
          }
        }
      }
      
      const originalRows = [];
      
      if (component._type === 'datatable' || component.type === 'datatable') {
        customTable = [];
        
        const dataRowKeys = dataRows.length > 0 ? Object.keys(dataRows[0]) : [];
        
        const orderedColumns = dataRowKeys.map(key => {
          const colDef = rows.find(col => {
            const fieldComp = col.component || col;
            return fieldComp.key === key;
          });
          
          if (colDef) {
            const fieldComp = colDef.component || colDef;
            return {
              key: key,
              label: fieldComp.label || fieldComp.key || key,
              type: fieldComp.type || 'textfield'
            };
          } else {
            return {
              key: key,
              label: key,
              type: 'textfield'
            };
          }
        });
        
        const columnLabels = orderedColumns.map(col => col.label);
        
        dataRows.forEach((rowDataObj) => {
          rowData = [];
          if (orderedColumns && Array.isArray(orderedColumns)) {
            orderedColumns.forEach(col => {
              const colKey = col.key;
              const cellValue = typeof rowDataObj === 'object' ? rowDataObj[colKey] : '';
              
              value = {};
              value._label = col.label;
              value._key = colKey;
              value._type = col.type;
              value._leaf = true;
              value._value = cellValue;
              column = [{ _children: value }];
              rowData.push({ _row: column });
            });
          }
          if (rowData.length > 0) {
            customTable.push({ _row: rowData });
          }
        });
        
        finalTable = {
          _label: label,
          _key: key,
          _row: customTable,
          _columnLabels: columnLabels,
          _isDataTable: true
        };
        
        return finalTable;
      } else {
        [...rows].reverse().map((row) => {
          if (Array.isArray(row)) {
            rowData = [];
            [...row].reverse().map((col) => {
              column = [];
              if (col && col.length > 0) {
                col.map(field => {
                  const fieldComp = field.component
                  value = {};
                  value._label = fieldComp.label;
                  value._key = fieldComp.key;
                  value._type = fieldComp.type;
                  value._leaf = true;
                  value._value = data[fieldComp.key];
                  column.push({ _children: value });
                });
              }
              if (column.length > 0) {
                rowData.push({ _row: column });
              } else {
                rowData.push({});
              }
            });
            if (rowData.length > 0) {
              originalRows.push({ _row: rowData });
            }
          }
        });
      }
      
      if (originalRows.length > 0) {
        customTable = [];
        const maxColumns = Math.max(...originalRows.map(row => row._row ? row._row.length : 0));
        
        for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
          const newRowData = [];
          
          originalRows.forEach((originalRow) => {
            if (originalRow._row && originalRow._row[colIndex]) {
              newRowData.push(originalRow._row[colIndex]);
            } else {
              newRowData.push({});
            }
          });
          
          customTable.push({ _row: newRowData });
        }
      }
      
      finalTable = {
        _label: label,
        _key: key,
        _row: customTable
      };
      return finalTable;
    };
    const customTable = customTableForReview(comp, comp.data || {});
    return renderTableHtml(customTable, comp);
  }

  if (comp?.type === 'textarea' || comp?.component?.type === 'textarea' || (value && typeof value === 'string' && value.includes('\n')))  {
    if (value === null || value === undefined || value === '') return '';
    const formattedValue = String(value).replace(/\n/g, '<br/>');
    return `__TEXTAREA__${formattedValue}__TEXTAREA__`;
  }

  if (comp?.type === 'survey' || comp?.component?.type === 'survey') {
    return renderSurveyHtml(comp, value);
  }

  if (value && value._type && (value._type === 'panel' || value._type === 'well' ||
    value._type === 'container' || value._type === 'fieldset' || value._type === 'columns')) {
    return `(${value._type} data)`;
  }
  if (value && value._label && typeof value._row === 'object') {
    return `(${value._type || 'Container'} data)`;
  }

  if (comp?.type === 'form' || comp?.component?.type === 'form') {
    return '(Form data)';
  }

  const isFileComponent = comp?.component?.type === 'file';

  if (isFileComponent) {
    if (Array.isArray(value)) {
      return formatArrayValue(value, isFileComponent);
    }
    if (value && typeof value === 'object') {
      return formatObjectValue(value, isFileComponent);
    }
    return value || '';
  }

  if (comp?.component?.type === 'signature') {
    return value ? 'Signed' : 'Not Signed';
  }

  if (comp?.type === 'tagpad' || (comp?.parent?.type === 'tagpad' && comp?.parent?.component?.type === 'tagpad')) {
    return formatTagpadValue(value);
  }

  if (comp?.component?.type === 'selectboxes') {
    return formatSelectboxesValue(value);
  }

  if (comp?.component?.type === 'select' || comp?.type === 'select') {
    return formatSelectValue(value, comp);
  }

  if (Array.isArray(value)) {
    return formatArrayValue(value, isFileComponent);
  }

  if (value && typeof value === 'object') {
    return formatObjectValue(value, isFileComponent);
  }

  if (comp?.type === 'currency' || comp?.component?.type === 'currency') {
    return formatCurrencyValue(value);
  }

  if (comp?.type === 'password' || comp?.component?.type === 'password') {
    return formatPasswordValue(value);
  }

  if (comp?.type === 'datetime' || comp?.component?.type === 'datetime' || 
      comp?.type === 'date' || comp?.component?.type === 'date' ||
      comp?.type === 'time' || comp?.component?.type === 'time') {
    return formatDateTimeValue(value, comp);
  }

  if (value === false) return 'No';
  if (value === true) return 'Yes';
  return value ?? '';
}

/**
 * Renders table HTML for display
 */
function renderTableHtml(customTable, comp) {
  // Battery optimization: Use array.join() instead of string concatenation for better performance
  const parts = [];
  const textareaRegex = /__TEXTAREA__/g; // Battery optimization: Cache regex
  
  parts.push(`<table style="width:100%;border-collapse:collapse;">`);
  
  if (customTable._isDataTable && customTable._columnLabels) {
    parts.push(`<thead style="background-color:#f8f9fa;">`);
    parts.push(`<tr>`);
    
    // Battery optimization: Build header row in one pass
    const headerCells = customTable._columnLabels.map(label => 
      `<th style="border:1px solid #ccc;padding:8px;text-align:left;font-weight:bold;">${label}</th>`
    );
    parts.push(...headerCells);
    
    parts.push(`</tr>`);
    parts.push(`</thead>`);
    parts.push(`<tbody>`);
    
    // Battery optimization: Build rows more efficiently
    for (let rowIdx = 0; rowIdx < customTable._row.length; rowIdx++) {
      const rowObj = customTable._row[rowIdx];
      parts.push(`<tr>`);
      
      if (Array.isArray(rowObj._row)) {
        for (let colIdx = 0; colIdx < rowObj._row.length; colIdx++) {
          const colObj = rowObj._row[colIdx];
          
          if (Array.isArray(colObj._row)) {
            const cellParts = [];
            
            for (let cellIdx = 0; cellIdx < colObj._row.length; cellIdx++) {
              const cellObj = colObj._row[cellIdx];
              if (cellObj._children) {
                const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                if (cellObj._children._type === 'textarea') {
                  cellParts.push(formattedValue.replace(textareaRegex, ''));
                } else {
                  cellParts.push(formattedValue ?? '');
                }
              }
            }
            
            parts.push(`<td style="border:1px solid #ccc;padding:8px;">${cellParts.join('')}</td>`);
          } else {
            parts.push(`<td style="border:1px solid #ccc;padding:8px;"></td>`);
          }
        }
      }
      
      parts.push(`</tr>`);
    }
    
    parts.push(`</tbody>`);
  } else {
    // Battery optimization: Build non-datatable rows more efficiently
    for (let rowIdx = 0; rowIdx < customTable._row.length; rowIdx++) {
      const rowObj = customTable._row[rowIdx];
      parts.push(`<tr>`);
      
      if (Array.isArray(rowObj._row)) {
        for (let colIdx = 0; colIdx < rowObj._row.length; colIdx++) {
          const colObj = rowObj._row[colIdx];
          
          if (Array.isArray(colObj._row)) {
            const cellParts = [];
            
            for (let cellIdx = 0; cellIdx < colObj._row.length; cellIdx++) {
              const cellObj = colObj._row[cellIdx];
              if (cellObj._children) {
                const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                if (cellObj._children._type === 'textarea') {
                  const textareaContent = formattedValue.replace(textareaRegex, '');
                  cellParts.push(`<div style="display: flex; align-items: flex-start;"><strong>${cellObj._children._label}:</strong>${textareaContent}</div>`);
                } else {
                  cellParts.push(`<strong>${cellObj._children._label}:</strong> ${formattedValue ?? ''}`);
                }
              }
              if (colObj._row.length > 1 && cellIdx < colObj._row.length - 1) {
                cellParts.push(`<br/>`);
              }
            }
            
            parts.push(`<td style="border:1px solid #ccc;padding:4px;">${cellParts.join('')}</td>`);
          } else {
            parts.push(`<td style="border:1px solid #ccc;padding:4px;"></td>`);
          }
        }
      }
      
      parts.push(`</tr>`);
    }
  }
  
  parts.push(`</table>`);
  return parts.join('');
}

/**
 * Renders survey HTML
 */
function renderSurveyHtml(comp, value) {
  let surveyHTML = '<div idx="7" style="padding-left: 10px;">';
  const padStyle = typeof pad !== 'undefined' ? pad : '';
  comp.component.questions.forEach((question, index) => {
    if (value[question.value]) {
      surveyHTML += `<div idx="8" style="${padStyle}padding-left: 10px; border-left:1px dotted #ccc;">
                      <strong>${question.label}:</strong> ${String(comp.component?.values[index].label)}
                    </div>`;
    } else {
      surveyHTML += `<div idx="9" style="${padStyle}padding-left: 10px; border-left:1px dotted #ccc;">
                      <strong>${question.label}:</strong>
                    </div>`;
    }
  });
  surveyHTML += `</div>`;
  return surveyHTML;
}

/**
 * Formats tagpad values
 */
function formatTagpadValue(value) {
  if (typeof value !== 'object' || value === null) {
    return value ?? '';
  }
  try {
    if (Array.isArray(value)) {
      return value.join(', ');
    } else if (typeof value === 'object') {
      return String(value?.value || value?.data || value?.text ||
        Object.values(value)[0] || JSON.stringify(value));
    }
  } catch (e) {
    console.warn('Error formatting tagpad value:', e);
  }
  return String(value);
}

/**
 * Formats selectboxes values
 */
function formatSelectboxesValue(value) {
  if (value && typeof value === 'object' && Object.values(value).some(v => typeof v === 'boolean')) {
    const selected = Object.keys(value).filter(k => value[k] === true);
    return selected.join(', ');
  }
  return value;
}

/**
 * Formats select dropdown values by converting values to their corresponding labels
 */
function formatSelectValue(value, comp) {
  if (!value || value === '') return '';
  
  const componentDef = comp.component || comp;
  const choices = componentDef.data?.values || componentDef.values || componentDef.choices || [];
  
  if (!Array.isArray(choices) || choices.length === 0) {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(v => {
      const choice = choices.find(c => c.value === v);
      return choice ? choice.label : v;
    }).join(', ');
  }
  
  const choice = choices.find(c => c.value === value);
  return choice ? choice.label : value;
}

/**
 * Formats array values
 */
function formatArrayValue(value, isFileComponent) {
  if (isFileComponent && value.length && typeof value[0] === 'object') {
    const names = value.map(v => v?.originalName || v?.name || v?.fileName || v?.path || '[file]');
    return names.join(', ');
  }
  return value.join(', ');
}

/**
 * Formats object values
 */
function formatObjectValue(value, isFileComponent) {
  if (isFileComponent) return value.originalName || value.name || value.fileName || '[file]';
  try { return JSON.stringify(value); } catch { return String(value); }
}

/**
 * Formats currency values
 */
function formatCurrencyValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(numValue)) return value ?? '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(numValue);
}

/**
 * Formats password values
 */
function formatPasswordValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const passwordLength = String(value).length;
  return '•'.repeat(passwordLength);
}

/**
 * Formats date/time values
 */
function formatDateTimeValue(value, comp) {
  if (value === null || value === undefined || value === '') return '';
  
  try {
    let date;
    
    if (comp?.type === 'time' || comp?.component?.type === 'time') {
      if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
        const today = new Date().toISOString().split('T')[0];
        date = new Date(`${today}T${value}`);
      } else {
        date = new Date(value);
      }
    } else {
      date = new Date(value);
    }
    
    if (isNaN(date.getTime())) return value;
    
    if (comp?.type === 'datetime' || comp?.component?.type === 'datetime') {
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } else if (comp?.type === 'date' || comp?.component?.type === 'date') {
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } else if (comp?.type === 'time' || comp?.component?.type === 'time') {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  } catch (e) {
    console.warn('Error formatting date/time value:', e);
    return value;
  }
}

/**
 * Gets the first leaf value from a node
 */
export function firstLeafVal(n) {
  if (!n) return '';
  if (n.__leaf) return formatValue(n.__value, n.__comp);
  
  // Battery optimization: Avoid Object.entries which creates arrays
  const children = n.__children;
  if (children) {
    for (const key in children) {
      if (children.hasOwnProperty(key)) {
        const v = firstLeafVal(children[key]);
        if (v !== '') return v;
      }
    }
  }
  return '';
}

/**
 * Checks if a field is invalid based on path and component
 */
export function isFieldInvalid(comp, path, invalidFields) {
  if (!invalidFields || invalidFields.size === 0) return false;

  // Battery optimization: Cache trimKey function
  const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
  const fieldPath = trimKey(path || comp?.path || comp?.key || comp?.component?.key || '');
  
  if (!fieldPath) return false;

  // Battery optimization: Early return for exact match
  if (invalidFields.has(fieldPath)) {
    return true;
  }

  // Battery optimization: Pre-compute path variations once
  const pathVariations = [
    fieldPath,
    `form.data.${fieldPath}`,
    `data.${fieldPath}`,
    `form.${fieldPath}`,
    fieldPath.replace('form.data.', ''),
    fieldPath.replace('data.', ''),
    fieldPath.replace('form.', '')
  ];

  for (let i = 0; i < pathVariations.length; i++) {
    if (invalidFields.has(pathVariations[i])) {
      return true;
    }
  }

  // Battery optimization: Cache regex patterns
  const arrayRegex = /(\w+\[\d+\])/;
  const hasArray = fieldPath.includes('[') && fieldPath.includes(']');
  
  if (hasArray) {
    // Battery optimization: Pre-compute fieldName and arrayMatch once
    const fieldName = fieldPath.split('.').pop();
    const arrayMatch = fieldPath.match(arrayRegex);
    
    if (arrayMatch) {
      const arrayPart = arrayMatch[1]; // e.g., "dataGrid[0]"
      const arrayPartLength = arrayPart.length;
      const fieldNameWithDot = '.' + fieldName;
      
      // Battery optimization: Cache normalizePath function outside loop
      const normalizePathCache = new Map();
      const normalizePath = (p) => {
        if (normalizePathCache.has(p)) {
          return normalizePathCache.get(p);
        }
        
        // Remove duplicate segments like "hardwareForm.hardwareForm" -> "hardwareForm"
        const segments = p.split('.');
        const deduped = [];
        for (let i = 0; i < segments.length; i++) {
          if (i === 0 || segments[i] !== segments[i-1]) {
            deduped.push(segments[i]);
          }
        }
        let normalized = deduped.join('.');
        
        // Remove common prefixes
        normalized = normalized.replace(/^hardwareForm\.hardwareForm\./, 'hardwareForm.');
        normalized = normalized.replace(/^form\.data\./, '');
        normalized = normalized.replace(/^data\./, '');
        
        normalizePathCache.set(p, normalized);
        return normalized;
      };
      
      // Battery optimization: Pre-compute normalized fieldPath once
      const normalizedFieldPath = normalizePath(fieldPath);
      
      for (const invalidField of invalidFields) {
        // Exact match
        if (invalidField === fieldPath) {
          return true;
        }
        
        // Battery optimization: Check normalized paths
        const normalizedInvalidField = normalizePath(invalidField);
        if (normalizedInvalidField === normalizedFieldPath) {
          return true;
        }
        
        // Battery optimization: Early exit checks
        const hasArrayPart = invalidField.includes(arrayPart);
        const endsWithFieldName = invalidField.endsWith(fieldNameWithDot);
        
        if (hasArrayPart && endsWithFieldName && fieldPath.includes(arrayPart) && fieldPath.endsWith(fieldNameWithDot)) {
          return true;
        }
        
        // Battery optimization: Check exact array part + field name match
        if (invalidField === `${arrayPart}${fieldNameWithDot}`) {
          return true;
        }
        
        // Battery optimization: Pre-compute array positions once
        const fieldPathArrayIdx = fieldPath.indexOf(arrayPart);
        const invalidFieldArrayIdx = invalidField.indexOf(arrayPart);
        
        if (fieldPathArrayIdx >= 0 && invalidFieldArrayIdx >= 0) {
          const fieldPathAfterArray = fieldPath.substring(fieldPathArrayIdx + arrayPartLength);
          const invalidFieldAfterArray = invalidField.substring(invalidFieldArrayIdx + arrayPartLength);
          
          if (fieldPathAfterArray.endsWith(fieldNameWithDot) && invalidFieldAfterArray.endsWith(fieldNameWithDot)) {
            return true;
          }
        }
        
        // Battery optimization: Check field name match with array part
        if (fieldPath.endsWith(fieldNameWithDot) && invalidField.endsWith(fieldNameWithDot)) {
          if (fieldPath.includes(arrayPart) && invalidField.includes(arrayPart)) {
            return true;
          }
        }
      }
    }
  } else {
    // Battery optimization: Pre-compute fieldName once
    const fieldName = fieldPath.split('.').pop();
    const fieldNameWithDot = '.' + fieldName;
    
    for (const invalidField of invalidFields) {
      if (invalidField === fieldPath) {
        return true;
      }
      
      // Battery optimization: Check non-array fields
      const hasNoArray = !invalidField.includes('[') && !invalidField.includes(']');
      if (hasNoArray && (invalidField.endsWith(fieldNameWithDot) || invalidField === fieldName)) {
        return true;
      }
      
      // Battery optimization: Check array fields ending with field name
      if (invalidField.includes('[') && invalidField.includes(']') && invalidField.endsWith(fieldNameWithDot)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Gets invalid styling for a field
 */
export function getInvalidStyle(comp, path, basePath = '', invalidFields, invalidComponents = new Set()) {
  if ((!invalidFields || invalidFields.size === 0) && (!invalidComponents || invalidComponents.size === 0)) {
    return '';
  }

  // Check by component reference first
  if (invalidComponents && invalidComponents.has(comp)) {
    return 'background-color:rgb(255 123 123); border-radius: 3px;';
  }
  
  // Also check by component key if the component reference doesn't match
  // Trim trailing spaces from keys
  const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
  const compKey = trimKey(comp?.key || comp?.component?.key || '');
  if (compKey && invalidFields) {
    // Check if any invalid field ends with this component key
    for (const invalidField of invalidFields) {
      const trimmedInvalidField = trimKey(invalidField);
      if (trimmedInvalidField.endsWith('.' + compKey) || trimmedInvalidField === compKey) {
        return 'background-color:rgb(255 123 123); border-radius: 3px;';
      }
    }
  }

  // Check by path
  if (invalidFields && isFieldInvalid(comp, path, invalidFields)) {
    return 'background-color:rgb(255 123 123); border-radius: 3px;';
  }
  
  // Also check component's actual path
  const compPath = trimKey(comp?.path || comp?.key || comp?.component?.key || '');
  if (compPath && compPath !== path && invalidFields && isFieldInvalid(comp, compPath, invalidFields)) {
    return 'background-color:rgb(255 123 123); border-radius: 3px;';
  }

  if (basePath && invalidFields) {
    const fullPath = `${basePath}.${path}`;
    if (isFieldInvalid(comp, fullPath, invalidFields)) {
      return 'background-color:rgb(255 123 123); border-radius: 3px;';
    }
  }

  return '';
}

// Battery optimization: Cache row container lookups
const rowContainerCache = new WeakMap();

function findRowContainer(element) {
  if (!element) return null;
  
  // Battery optimization: Check cache first
  if (rowContainerCache.has(element)) {
    const cached = rowContainerCache.get(element);
    // Verify element is still in DOM
    if (cached && document.contains(cached)) {
      return cached;
    }
    rowContainerCache.delete(element);
  }
  
  let rowContainer = element.closest('.formio-component-panel') ||
    element.closest('[ref="row"]') ||
    element.closest('.formio-component-columns') ||
    element.closest('.list-group-item') ||
    element.parentElement;

  if (!rowContainer || !rowContainer.classList) {
    let parent = element;
    // Battery optimization: Limit traversal depth
    for (let i = 0; i < 5 && parent; i++) {
      if (parent.classList && (
        parent.classList.contains('formio-component') ||
        parent.hasAttribute('data-noattach') ||
        parent.classList.contains('row')
      )) {
        rowContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }

  // Battery optimization: Cache result
  if (rowContainer) {
    rowContainerCache.set(element, rowContainer);
  }

  return rowContainer;
}

/**
 * Adds visual error highlighting to a row (red border + pink background)
 * @param {HTMLElement} element - The element to highlight
 */
export function addErrorHighlight(element) {
  if (!element) return;

  const rowContainer = findRowContainer(element);

  if (rowContainer && rowContainer.style) {
    rowContainer.classList.add('has-error', 'alert', 'alert-danger');
    rowContainer.style.setProperty('border-left', '4px solid #d9534f', 'important');
    rowContainer.style.setProperty('background-color', '#fff5f5', 'important');
    rowContainer.style.setProperty('margin-bottom', '10px', 'important');
    rowContainer.style.setProperty('padding', '10px', 'important');
    rowContainer.setAttribute('data-has-errors', 'true');
  }
}

/**
 * Removes visual error highlighting from a row
 * @param {HTMLElement} element - The element to un-highlight
 */
export function removeErrorHighlight(element) {
  if (!element) return;

  const rowContainer = findRowContainer(element);

  if (rowContainer && rowContainer.style) {
    rowContainer.classList.remove('has-error', 'alert', 'alert-danger');
    rowContainer.style.removeProperty('border-left');
    rowContainer.style.removeProperty('background-color');
    rowContainer.style.removeProperty('margin-bottom');
    rowContainer.style.removeProperty('padding');
    rowContainer.removeAttribute('data-has-errors');
  }
}

/**
 * Ensures error highlight styles are available in the document
 */
export function ensureErrorHighlightStyles() {
  if (document.getElementById('formio-row-error-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'formio-row-error-styles';
  style.textContent = `
    .formio-component-panel.has-error,
    .formio-component-panel.alert-danger,
    [ref="row"].has-error,
    [ref="row"].alert-danger,
    .formio-component-columns.has-error,
    .formio-component-columns.alert-danger,
    .list-group-item.has-error,
    .list-group-item.alert-danger {
      border-left: 4px solid #d9534f !important;
      background-color: #fff5f5 !important;
      margin-bottom: 10px !important;
      padding: 10px !important;
    }
    
    .formio-component-panel[data-has-errors="true"],
    [ref="row"][data-has-errors="true"],
    .formio-component-columns[data-has-errors="true"],
    .list-group-item[data-has-errors="true"] {
      border-left: 4px solid #d9534f !important;
      background-color: #fff5f5 !important;
      margin-bottom: 10px !important;
      padding: 10px !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Applies field-level error messages and styling to components with errors
 * @param {Object} panel - Panel component containing the fields
 */
export function applyFieldErrors(panel) {
  if (!panel || !panel._hasErrors || !panel._errorMap) {
    return;
  }

  let attemptCount = 0;
  const maxAttempts = 10;
  const errorMapKeys = Object.keys(panel._errorMap); // Battery optimization: Cache keys
  const totalErrors = errorMapKeys.length;

  const tryApplyErrors = function() {
    let appliedCount = 0;
    const domUpdates = []; // Battery optimization: Batch DOM updates

    panel.everyComponent(function(comp) {
      const compKey = comp.component && comp.component.key;
      if (compKey && panel._errorMap[compKey]) {
        const err = panel._errorMap[compKey];

        comp.error = err.message;
        if (comp.setCustomValidity) {
          comp.setCustomValidity([err], true);
        }
        comp.setPristine(false);

        if (comp.element) {
          // Battery optimization: Batch DOM class updates
          domUpdates.push(() => {
            comp.element.classList.add('has-error', 'has-message', 'formio-error-wrapper');
          });

          // Battery optimization: Cache DOM queries
          const formGroup = comp.element.closest('.form-group') || comp.element.querySelector('.form-group') || comp.element;
          domUpdates.push(() => {
            formGroup.classList.add('has-error');
          });

          const compType = comp.type || comp.component.type;
          const input = comp.element.querySelector('input, select, textarea, .choices');
          
          if (input) {
            // Battery optimization: Batch style updates
            domUpdates.push(() => {
              input.classList.add('is-invalid', 'form-control-danger');
              input.style.borderColor = '#d9534f';
              input.style.borderWidth = '2px';
            });

            const errMsg = document.createElement('div');
            errMsg.className = 'formio-errors invalid-feedback';
            errMsg.style.display = 'block';
            errMsg.style.color = '#d9534f';
            errMsg.innerHTML = '<p style="margin:0;">' + err.message + '</p>';

            const existing = comp.element.querySelector('.formio-errors');
            if (existing) {
              domUpdates.push(() => existing.remove());
            }

            // Battery optimization: Determine insert point once
            let insertPoint;
            if (compType === 'barcode') {
              const barcodeWrapper = input.closest('.input-group') ||
                input.closest('.form-group') ||
                input.parentElement;

              if (barcodeWrapper && barcodeWrapper.parentElement) {
                insertPoint = barcodeWrapper.parentElement;
                domUpdates.push(() => {
                  if (barcodeWrapper.nextSibling) {
                    insertPoint.insertBefore(errMsg, barcodeWrapper.nextSibling);
                  } else {
                    insertPoint.appendChild(errMsg);
                  }
                });
              } else {
                insertPoint = comp.element;
                domUpdates.push(() => insertPoint.appendChild(errMsg));
              }
            } else if (compType === 'radio') {
              const radioContainer = comp.element.querySelector('.form-radio') ||
                comp.element.querySelector('.radio') ||
                comp.element.querySelector('[role="radiogroup"]') ||
                formGroup;

              insertPoint = radioContainer || comp.element;
              domUpdates.push(() => insertPoint.appendChild(errMsg));
            } else {
              insertPoint = input.parentElement || comp.element;
              domUpdates.push(() => insertPoint.appendChild(errMsg));
            }

            appliedCount++;
          }
        }
      }
    });

    // Battery optimization: Batch all DOM updates using requestAnimationFrame
    if (domUpdates.length > 0) {
      requestAnimationFrame(() => {
        domUpdates.forEach(update => update());
      });
    }

    if (appliedCount < totalErrors && attemptCount < maxAttempts) {
      attemptCount++;
      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(() => {
        setTimeout(tryApplyErrors, 100); // Reduced from 200ms
      });
    }
  };

  tryApplyErrors();
}
