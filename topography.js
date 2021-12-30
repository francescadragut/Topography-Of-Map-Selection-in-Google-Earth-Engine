//Imports
var image = ee.Image("USGS/SRTMGL1_003"),
    NOAA = ee.Image("NOAA/NGDC/ETOPO1"),
    GSWM = ee.Image("JRC/GSW1_0/GlobalSurfaceWater"),
    elev = ee.Image("MERIT/DEM/v1_0_3"),
    geometry = /* color: #23cba7 */ee.Geometry.MultiPoint();
    
//The script

/*A. Set map center on Romania*/
Map.setCenter(24.5, 46.5, 6.2);

/* B. Enable the user to draw a geometry*/
var drawingTools = Map.drawingTools();
drawingTools.setShown(false);

while (drawingTools.layers().length() > 0) {
  var layer = drawingTools.layers().get(0);
  drawingTools.layers().remove(layer);
}

var dummyGeometry =
    ui.Map.GeometryLayer({geometries: null, name: 'geometry', color: '23cba7'});

drawingTools.layers().add(dummyGeometry);
function clearGeometry() {
  var layers = drawingTools.layers();
  layers.get(0).geometries().remove(layers.get(0).geometries().get(0));
}

function drawRectangle() {
  clearGeometry();
  drawingTools.setShape('rectangle');
  drawingTools.draw();
}
function drawPolygon() {
  clearGeometry();
  drawingTools.setShape('polygon');
  drawingTools.draw();
}
function drawPoint() {
  clearGeometry();
  drawingTools.setShape('point');
  drawingTools.draw();
}


/*C. Build the control panel*/

// 1. Define symbols for drawing shapes in the control panel
var symbol = {
  rectangle: '⬛',
  polygon: '🔺',
  point: '📍'
}

// 2. Create label for title of the app
var welcome = ui.Label({
  value: 'Topography of Map Selection',
  style: {width:'700px', height:'70px',fontSize:'30px',color: '484848',textAlign:'center'}
})
Map.add(welcome);

// 3. Create the control panel
var controlPanel = ui.Panel({
  widgets: [
    ui.Label('Select shape of the selection:'),
    ui.Button({
      label: symbol.rectangle + 'Select Rectangle',
      onClick: drawRectangle,
      style: {stretch: 'horizontal'}
    }),
    ui.Button({
      label: symbol.polygon + 'Select Polygon',
      onClick: drawPolygon,
      style: {stretch: 'horizontal'}
    }),
  
    ui.Label('Wait for results to render.'),
  ],
  style: {position: 'bottom-left'},
  layout: null,
});

// 4. Add control panel to the app
Map.add(controlPanel);

/* D. Function to enable the results panel to only be visible after drawing*/

function resultsGeneration() {

  /* 1. Turn the geometry selected by the user into an object to be handled by the program*/
    // 1.1. Get the drawn geometry; it will define the reduction region.
    var aoi = drawingTools.layers().get(0).getEeObject();
  
    // 1.2. Set the drawing mode back to null; turns drawing off.
    drawingTools.setShape(null);
  
  /* 2. Compute coordinates for Area of Interest (AOI)*/
  var listCoords = ee.Array.cat(aoi.coordinates(), 1);
  var xCoords = listCoords.slice(1, 0, 1); 
  var yCoords = listCoords.slice(1, 1, 2); 
  
  var xMin = xCoords.reduce('min', [0]).get([0,0]); 
  var xMax = xCoords.reduce('max', [0]).get([0,0]);
  var yMin = yCoords.reduce('min', [0]).get([0,0]);
  var yMax = yCoords.reduce('max', [0]).get([0,0]);

  /* 2. Create layers to build topography*/
    /* 2.1. ALOS DSM: Global 30m */
    var ALOS = ee.Image('JAXA/ALOS/AW3D30/V2_2').multiply(4);
    /* 2.2. Traditional Hillshade (input,azimuth,altitude).multiply(weight) */
      var N = ee.Terrain.hillshade(ALOS,0,36).multiply(0);
      var NE = ee.Terrain.hillshade(ALOS,45,44).multiply(0);
      var E = ee.Terrain.hillshade(ALOS,90,56).multiply(0);
      var SE = ee.Terrain.hillshade(ALOS,135,68).multiply(0);
      var S = ee.Terrain.hillshade(ALOS,180,80).multiply(0.1);
      var SW = ee.Terrain.hillshade(ALOS,225,68).multiply(0.2);
      var W = ee.Terrain.hillshade(ALOS,270,56).multiply(0.2);
      var NW = ee.Terrain.hillshade(ALOS,315,44).multiply(0.5);
    /* 2.3. Multidirectional Hillshade */
      var MULTI = N
          .add(NE)
          .add(E)
          .add(SE)
          .add(S)
          .add(SW)
          .add(W)
          .add(NW)
          .visualize({
          min:0,
          max:255,
          palette:[
              '#000000',
              '#ffffff'
              ],
          })
          .resample('bicubic')
          .updateMask(0.5);
    /* 2.4. Slope */
    var SLOPE = ee.Terrain.slope(ALOS)
        .multiply(2)
        .visualize({
            min:100,
            max:180,
            palette:[
                '#ffffff',
                '#000000'
                ]
            })
        .resample('bicubic')
        .updateMask(1);
    /* 2.5. Shaded Relief */
    var SHADED_RELIEF = ee.ImageCollection([
        SLOPE,
        MULTI
        ])
        .mosaic()
        .reduce(
          ee.Reducer.median()
          )
        .updateMask(1);
    /* 2.6. Elevation */
    var ELEVATION = ALOS
        .visualize({
            bands:['AVE_DSM'],
            min:0,
            max:12500,
            palette:[
                '#386641',
                '#6a994e',
                '#a7c957',
                '#fdf7d6',
                '#ffffff'
                ]
            })
        .resample('bicubic')
        .updateMask(0.4);
    /* 2.7. Surface Water */
    var SURFACE_WATER = GSWM
        .visualize({
            bands:['occurrence'],
            min:0,
            max:100,
            palette:[
                '#B9E9E7'
                ]
            })
        .resample('bicubic');
    /* 2.8. Sea */
    var SEA = ALOS
        .updateMask(ALOS.lte(0))
        .visualize({
            bands:['AVE_DSM'],
            min:0,
            max:0,
            palette:[
                'B9E9E7'
                ]
            })
        .resample('bicubic');
    /* 2.9. Bathymetry */
    var BATHYMETRY = NOAA
        .updateMask(NOAA.lte(-10))
        .visualize({
            bands:['bedrock'],
            min:-5000,
            max:0,
            palette:[
                '#8ECCCB',
                '#ABE0DF',
                'B9E9E7'
                ]
            })
        .resample('bicubic');
    
  /* 3. Compute mean, max and min elevations for the results panel*/
      /* 3.1. Create dictionaries of image reduction*/
      var dict = image.reduceRegion({
          reducer: "mean",
          geometry: aoi,
          scale: 900
        });
      var dictt = image.reduceRegion({
          reducer: "max",
          geometry: aoi,
          scale: 900
      });
      var dicttt = image.reduceRegion({
          reducer: "min",
          geometry: aoi,
          scale: 900
      });
      
      
      /* 3.2. Create UI labels in which to store each information obtained in 3.1.*/
      var mean = ui.Label();
      mean.setValue('Mean elevation: '+JSON.stringify(dict.get('elevation').getInfo()));
      var max = ui.Label();
      max.setValue('🔴'+'Maximum elevation: '+JSON.stringify(dictt.get('elevation').getInfo())+'m');
      var min = ui.Label();
      min.setValue('🟢'+'Minimum elevation: '+JSON.stringify(dicttt.get('elevation').getInfo())+'m');
    
    var text = require('users/gena/packages:text');
    
    var im = image.clip(aoi);
    var pixel_pos = ee.Image.pixelLonLat();
    var high = im.reduceRegion(ee.Reducer.max(), aoi, 900).get('elevation');
    var highest = im.eq(ee.Image.constant(high));
    var highest_point_image = im.addBands(pixel_pos).mask(highest);
    var highest_point = highest_point_image.reduceRegion(ee.Reducer.mean(), aoi, 900);
    var x_max = highest_point.get('longitude');
    var y_max = highest_point.get('latitude');
    var pt_max = ee.Geometry.Point([x_max,y_max]);
    print(x_max,y_max);

    
    var pixel_pos_min = ee.Image.pixelLonLat();
    var low = im.reduceRegion(ee.Reducer.min(), aoi, 900).get('elevation');
    var lowest = im.eq(ee.Image.constant(low));
    var lowest_point_image = im.addBands(pixel_pos).mask(lowest);
    var lowest_point = lowest_point_image.reduceRegion(ee.Reducer.mean(), aoi, 900);
    var x_min = lowest_point.get('longitude');
    var y_min = lowest_point.get('latitude');
    var pt_min = ee.Geometry.Point([x_min,y_min]);
    print(x_min,y_min);
    
  /* 4. Add layers to create topography*/
    Map.addLayer(
    SHADED_RELIEF.clip(aoi),{
        min:0,
        max:255,
        gamma:1
        },
      'Shaded Relief',
    true
    );
  
    Map.addLayer(
      ELEVATION.clip(aoi),{},
        'Elevation',
      true
    );
    
    Map.addLayer(
      SURFACE_WATER.clip(aoi),{},
        'Surface Water',
      true
    );
    
    Map.addLayer(
      SEA.clip(aoi),{},
        'Sea',
      true
    );
  
    Map.addLayer(
      BATHYMETRY.clip(aoi),{},
        'Bathymetry',
      true
    );
    
    //4.1. Add layers for the minimum and maximum points on the map
    Map.addLayer(pt_max, {color:'red'}, 'Highest point');
    Map.addLayer(pt_min, {color:'green'}, 'Lowest point');
    
  /* 5. Create the results panel, clear geometry and add results panel to map*/
    /* 5.1 Create the results panel*/
    var resultsPanel = ui.Panel({
      widgets: [
        ui.Label('ELEVATION DATA'),
        mean,
        max,
        min,
      ],
      style: {position: 'bottom-right'},
      layout: null,
    });
    /* 5.2. Clear the geometry from the map, in order to make topography visible*/
    clearGeometry();
    /* 5.3. Add results panel to the map*/
    Map.add(resultsPanel);
}

/* 5. Make results visible on drawing/editing*/
drawingTools.onDraw(ui.util.debounce(resultsGeneration, 500));
drawingTools.onEdit(ui.util.debounce(resultsGeneration, 500));
