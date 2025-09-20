/**
 * UI rendering helpers for ReviewButton component
 * Contains logic for rendering HTML and formatting values for display
 */

import { isContainerType, shouldFlattenContainer } from "./validationUtils.js";

/**
 * Formats a value for display based on component type
 */
export function formatValue(value, comp) {
  if (value && (value._type === 'table' || value._type === 'datatable') && (Array.isArray(comp.table) || Array.isArray(comp.dataValue) || Array.isArray(comp.rows))) {
    const customTableForReview = (component, data = {}) => {
      var label = component.label;
      var key = component.key;
      var customTable = null;
      var customPanel = null;
      var customColumn = null;
      var rowData = [];
      var value = {};
      var column = [];
      var finalTable = [];
      
      // Handle both regular tables and data tables
      var rows = component.table || component.components || component.columns;
      var dataRows = [];
      
      // For data tables, get the actual data
      if (component._type === 'datatable' || component.type === 'datatable') {
        dataRows = Array.isArray(component.dataValue) ? component.dataValue :
                  Array.isArray(component.rows) ? component.rows :
                  Array.isArray(component.data) ? component.data :
                  Array.isArray(data[key]) ? data[key] : [];
                  
        // If we have data but no column definitions, create them from data keys
        if (dataRows.length > 0 && (!rows || rows.length === 0)) {
          const firstRow = dataRows[0];
          if (typeof firstRow === 'object') {
            rows = Object.keys(firstRow).map(k => ({ component: { key: k, label: k, type: 'textfield' } }));
          }
        }
      }
      
      // First, collect all the original data structure
      var originalRows = [];
      
      // Handle data tables differently from regular tables
      if (component._type === 'datatable' || component.type === 'datatable') {
        // For data tables, use traditional table layout: columns=fields, rows=data records
        // Don't transpose - just create the structure directly
        customTable = [];
        
        // Use the order from dataRows keys, not from rows configuration
        const dataRowKeys = dataRows.length > 0 ? Object.keys(dataRows[0]) : [];
        
        // Create column definitions based on dataRowKeys order
        const orderedColumns = dataRowKeys.map(key => {
          // Find the corresponding component definition
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
            // Fallback if no component definition found
            return {
              key: key,
              label: key,
              type: 'textfield'
            };
          }
        });
        
        const columnLabels = orderedColumns.map(col => col.label);
        
        // Create each data row using ordered columns
        dataRows.forEach((rowDataObj, rowIndex) => {
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
        
        // Store column labels for header generation
        finalTable = {
          _label: label,
          _key: key,
          _row: customTable,
          _columnLabels: columnLabels,
          _isDataTable: true
        };
        
        return finalTable;
      } else {
        // Regular table processing
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
              }
              else{
                rowData.push({  });
              }
            });
            if (rowData.length > 0) {
              originalRows.push({ _row: rowData });
            }
          }
        });
      }
      
      // Now transpose: turn rows into columns
      if (originalRows.length > 0) {
        customTable = [];
        const maxColumns = Math.max(...originalRows.map(row => row._row ? row._row.length : 0));
        
        // For each original column index, create a new row
        for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
          const newRowData = [];
          
          // For each original row, take the cell at colIndex and make it a column in the new row
          originalRows.forEach((originalRow) => {
            if (originalRow._row && originalRow._row[colIndex]) {
              newRowData.push(originalRow._row[colIndex]);
            } else {
              newRowData.push({  }); // Empty cell
            }
          });
          
          customTable.push({ _row: newRowData });
        }
      }
      
      finalTable = {
        _label: label,
        _key: key,
        _row: customTable || customPanel || customColumn
      };
      return finalTable;
    };
    const customTable = customTableForReview(comp, comp.data || {});
    return renderTableHtml(customTable, comp);
  }

  if (comp?.type === 'textarea' || comp?.component?.type === 'textarea' || (value && typeof value === 'string' && value.includes('\n')))  {
    if (value === null || value === undefined || value === '') return '';
    const formattedValue = String(value).replace(/\n/g, '<br/>'); // Preserve line breaks
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

  if (comp?.component?.type === 'signature') {
    return value ? 'Signed' : 'Not Signed';
  }

  if (comp?.type === 'tagpad' || (comp?.parent?.type === 'tagpad' && comp?.parent?.component?.type === 'tagpad')) {
    return formatTagpadValue(value);
  }

  if (comp?.component?.type === 'selectboxes') {
    return formatSelectboxesValue(value);
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
  let tableHtml = '';
  tableHtml += `<table style="width:100%;border-collapse:collapse;">`;
  
  // Handle data tables with headers
  if (customTable._isDataTable && customTable._columnLabels) {
    // Add header row for data tables
    tableHtml += `<thead style="background-color:#f8f9fa;">`;
    tableHtml += `<tr>`;
    customTable._columnLabels.forEach(label => {
      tableHtml += `<th style="border:1px solid #ccc;padding:8px;text-align:left;font-weight:bold;">${label}</th>`;
    });
    tableHtml += `</tr>`;
    tableHtml += `</thead>`;
    
    // Add data rows
    tableHtml += `<tbody>`;
    customTable._row.forEach(rowObj => {
      tableHtml += `<tr>`;
      if (Array.isArray(rowObj._row)) {
        rowObj._row.forEach(colObj => {
          if (Array.isArray(colObj._row)) {
            tableHtml += `<td style="border:1px solid #ccc;padding:8px;">`;
            colObj._row.forEach(cellObj => {
              if (cellObj._children) {
                const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                if (cellObj && cellObj._children && cellObj._children._type && cellObj._children._type === 'textarea') {
                  const textareaContent = formattedValue.replace(/__TEXTAREA__/g, '');
                  tableHtml += `${textareaContent}`;
                } else {
                  tableHtml += `${formattedValue ?? ''}`;
                }
              }
            });
            tableHtml += `</td>`;
          } else{
            tableHtml += `<td style="border:1px solid #ccc;padding:8px;"></td>`;
          }
        });
      } 
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody>`;
  } else {
    // Regular table processing (transposed with field labels)
    customTable._row.forEach(rowObj => {
      tableHtml += `<tr>`;
      if (Array.isArray(rowObj._row)) {
        rowObj._row.forEach(colObj => {
          if (Array.isArray(colObj._row)) {
            tableHtml += `<td style="border:1px solid #ccc;padding:4px;">`;
            colObj._row.forEach(cellObj => {
              if (cellObj._children) {
                const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                if (cellObj && cellObj._children && cellObj._children._type && cellObj._children._type === 'textarea') {
                  const textareaContent = formattedValue.replace(/__TEXTAREA__/g, '');
                  tableHtml += `<div style="display: flex; align-items: flex-start;"><strong>${cellObj._children._label}:</strong>${textareaContent}</div>`;
                } else {
                  tableHtml += `<strong>${cellObj._children._label}:</strong> ${formattedValue ?? ''}`;
                }
              }
              if(colObj._row.length > 1){
                tableHtml += `<br/>`;
              }
            });
            tableHtml += `</td>`;
          } else{
            tableHtml += `<td style="border:1px solid #ccc;padding:4px;"></td>`;
          }
        });
      } 
      tableHtml += `</tr>`;
    });
  }
  
  tableHtml += `</table>`;
  return tableHtml;
}

/**
 * Renders survey HTML
 */
function renderSurveyHtml(comp, value) {
  let surveyHTML = '<div idx="7" style="padding-left: 10px;">';
  const padStyle = typeof pad !== 'undefined' ? pad : '';
  const depthLevel = typeof depth !== 'undefined' ? depth : 0;
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
  return '•'.repeat(passwordLength); // Show one dot per character
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
        const today = new Date().toISOString().split('T')[0]; // Get today in YYYY-MM-DD format
        date = new Date(`${today}T${value}`);
      } else {
        date = new Date(value);
      }
    } else {
      date = new Date(value);
    }
    
    if (isNaN(date.getTime())) return value; // Return original value if not a valid date
    
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
    return value; // Return original value if formatting fails
  }
}

/**
 * Gets the first leaf value from a node
 */
export function firstLeafVal(n) {
  if (!n) return '';
  if (n.__leaf) return formatValue(n.__value, n.__comp);
  for (const [, child] of Object.entries(n.__children || {})) {
    const v = firstLeafVal(child);
    if (v !== '') return v;
  }
  return '';
}

/**
 * Checks if a field is invalid based on path and component
 */
export function isFieldInvalid(comp, path, invalidFields) {
  if (!invalidFields || invalidFields.size === 0) return false;

  const fieldPath = path || comp?.path || comp?.key || comp?.component?.key;
  
  if (!fieldPath) return false;

  // Direct path match
  if (invalidFields.has(fieldPath)) {
    return true;
  }

  // Try various path variations
  const pathVariations = [
    fieldPath,
    `form.data.${fieldPath}`,
    `data.${fieldPath}`,
    `form.${fieldPath}`,
    fieldPath.replace('form.data.', ''),
    fieldPath.replace('data.', ''),
    fieldPath.replace('form.', '')
  ];

  for (const variation of pathVariations) {
    if (invalidFields.has(variation)) {
      return true;
    }
  }

  // For array fields, check if any invalid field matches the same array index and field name
  if (fieldPath.includes('[') && fieldPath.includes(']')) {
    const fieldName = fieldPath.split('.').pop();
    const arrayMatch = fieldPath.match(/(\w+\[\d+\])/);
    
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
    const fieldName = fieldPath.split('.').pop();
    
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
 * Gets invalid styling for a field
 */
export function getInvalidStyle(comp, path, basePath = '', invalidFields) {
  if (!invalidFields || invalidFields.size === 0) return '';

  // Use the improved isFieldInvalid function for more precise matching
  if (isFieldInvalid(comp, path, invalidFields)) {
    return 'background-color:rgb(255 123 123); border-radius: 3px;';
  }

  // Also check with basePath if provided
  if (basePath) {
    const fullPath = `${basePath}.${path}`;
    if (isFieldInvalid(comp, fullPath, invalidFields)) {
      return 'background-color:rgb(255 123 123); border-radius: 3px;';
    }
  }

  return '';
}
