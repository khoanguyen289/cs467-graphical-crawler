var crawlerApp = angular.module('crawlerApp', ['ngRoute', 'ngAnimate']);
var graph = {};
crawlerApp.config(function($routeProvider, $locationProvider) {
    $routeProvider
        .when('/', {
            templateUrl : 'form.html',
            controller : 'contentController'
        })
        .when('/results', {
            templateUrl : 'results.html',
            controller : 'contentController'
        });

        $locationProvider.html5Mode(true);
});

crawlerApp.controller('contentController', function($scope, $location) {
    $scope.website = Cookies.get("website");
    $scope.traversal = Cookies.get("traversal");
    $scope.stepsDepth = Cookies.get("stepsDepth");
    $scope.stepsBreadth = Cookies.get("stepsBreadth");
    radioSelection($scope.traversal);
    if(angular.isUndefined($scope.stepsDepth)) {
        $scope.stepsDepth = "5";
    }
    if(angular.isUndefined($scope.stepsBreadth)) {
        $scope.stepsBreadth = "2";
    }
    $scope.keyword = Cookies.get("keyword");
    $scope.go = function ( path ) {
        if(checkFormFilled()) {
            var websiteInput = $("#website-input").val();
            var traversalInput = $("input[name=traversal]:checked").val();
            var stepsInput = $("#steps-input").val();
            var keywordInput = $("#keyword-input").val();
            if (traversalInput === 'depth') {
                stepsInput = $("#steps-input-dfs").val();
            }
            else if (traversalInput === 'breadth') {
                stepsInput = $("#steps-input-bfs").val();
            }
            initiateLoading();
            //retry adapted from https://gist.github.com/rainyjune/4084886
            $.ajax({
                type: "POST",
                url: "process-options",
                data: $("#options-form").serialize(),
                tryCount: 0,
                retryLimit: 3, 
                success: function(data) {
                    Cookies.set("website", websiteInput);
                    Cookies.set("traversal", traversalInput);
                    if (traversalInput === 'depth') {
                        Cookies.set("stepsDepth", stepsInput);
                    }
                    else if (traversalInput === 'breadth') {
                        Cookies.set("stepsBreadth", stepsInput);
                    }
                    if(keywordInput !== "") {
                        Cookies.set("keyword", keywordInput);
                    }
                    else {
                        Cookies.remove("keyword");
                    }

                    graph = data;
                    $scope.$apply(function() {
                        $location.path( path );
                    });
                    window.scrollTo(0,0);
                },
                statusCode: {
                    400: function(xhr) {
                        stopLoadingAfterError();
                        showErrorBar("There was a problem with your request. " + xhr.responseText);
                    },
                    500: function() {
                        stopLoadingAfterError();
                        showErrorBar("Unknown error. Please try again.");
                    },
                    502: function() {
                        this.tryCount++;
                        if(this.tryCount <= this.retryLimit) {
                            $.ajax(this);
                            return;
                        }
                        else {
                            stopLoadingAfterError();
                            showErrorBar("Unknown error. Please try again.");
                        }
                    }
                }
            });
        }
    };
});

crawlerApp.directive("graph", function() {
    return {
        link: function() {
            initD3();
        }
    }
});

function initiateLoading() {
    //blur form and make unclickable
    $("#form-container")
    .css(
        {"-webkit-filter":"blur(3px)",
        "-moz-filter":"blur(3px)",
        "-o-filter":"blur(3px)",
        "-ms-filter":"blur(3px)",
        "filter":"blur(3px)",
        "pointer-events":"none"}
    );

    //show loading modal
    $("#loading-modal")
    .css("display", "block");
}

function stopLoadingAfterError() {
    //make form container visible
    $("#form-container")
    .css(
        {"-webkit-filter":"none",
        "-moz-filter":"none",
        "-o-filter":"none",
        "-ms-filter":"none",
        "filter":"none",
        "pointer-events":"auto"}
    );
    //hide loading modal
    $("#loading-modal")
    .css("display", "none");
}

function checkFormFilled() {
    var filled = true;
    if($("#website-input").val() === "" || !($("#depth-option").is(":checked") || $("#breadth-option").is(":checked"))) {
        filled = false;
        showErrorBar("One or more required parameters is missing.")
    }
    return filled;
}

function showErrorBar(text) {
    $("#error-text").text("Error | " + text);
    if($("#required-bar").hasClass("error-found")) {
        $("#required-bar").removeClass("error-found");
        void document.getElementById("required-bar").offsetWidth;
    }
    $("#required-bar").toggleClass("error-found");
}

function initD3() {
    var random = Math.random();

    var zoom = d3.zoom()
        .on("zoom", zoomed)
        .scaleExtent([0.05, 5]);

    var svg = d3.select("#results-pane").append("svg")
        .attr("class", "grabbable")
        .attr("width", $("#results-pane").width())
        .attr("height", $("#results-pane").height())
        .call(zoom); // add zoom

    var width = svg.attr("width");
    var height = svg.attr("height");

    // add encompassing group for zooming
    var everything = svg.append("g")
        .attr("class", "everything");

    var simulation = d3.forceSimulation()
        // pull nodes together based on the links between them
        .force("link", d3.forceLink().id(function(d) {return d.id;}).strength(0.3))
        // push nodes apart to space them out
        .force("charge", d3.forceManyBody().strength(-200))
        // add some collision detection so they don't overlap
        .force("collide", d3.forceCollide().radius(20))
        // and draw them around the centre of the space
        .force("center", d3.forceCenter(width / 2, height / 2))
        // control how fast the force decays
        .alphaDecay(0.04);

    var tooltip = d3.select("body")
        .append("div")
        .attr('class', 'tooltip');

    var keyword_node = graph.keyword_node;

    var nodes = graph.nodes,
        nodeById = d3.map(nodes, function(d) {return d.id; }),
        links = graph.links,
        bilinks = [];

    links.forEach(function(link) {
        var s = nodeById.get(link.source),
            t = nodeById.get(link.target),
            i = {}; // intermediate node
        nodes.push(i);
        links.push({source: s, target: i}, {source: i, target: t});
        bilinks.push([s, i, t]);
    });

    var link = everything.selectAll(".link")
        .data(bilinks)
        .enter().append("path")
        .attr("class", "link")
        .style("stroke", function(d) {return (d[0].id === 0) ? "gray": "hsl(" + (360 * random + 60 * d[0].depth) + ",90%,40%)"});

    var node = everything.selectAll(".node")
        .data(nodes.filter(function(d) {return d.depth + 1; })) // to filter out intermediate nodes
        .enter().append("circle")
        .attr("class", "node")
        .attr("r", 8)
        .attr("fill", function(d) { return (d.id === 0) ? "white" : "hsl(" + (360 * random + 60 * d.depth) + ",90%,80%)"})
        .attr("stroke", function(d) {
            if (d.id === keyword_node) {
                return "red";
            } else if (d.id === 0) {
                return "gray";
            } else {
                return "hsl(" + (360 * random + 60 * d.depth) + ",90%,40%)";
            }})
        .attr("stroke-width", function(d) {return (d.id === keyword_node) ? "6px": "2px"})
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))

        .on("click", function(d) {
            d.fx = null;
            d.fy = null;
            tooltip.text(d.url);
            // tooltip.html('<a href="' + d.url + '">' + d.url + '</a>'); // show link
        })

        .on("dblclick", function(d) {
            window.open(
                d.url,
                '_blank'
            );
        })

        .on("mouseover", function(d) {
            d3.select(this).attr("r", 12);
            tooltip.style("visibility", "visible").text(d.title);
        })

        .on("mousemove", function() {
            tooltip.style("top", (d3.event.pageY - 20) + "px")
                   .style("left", (d3.event.pageX + 15) + "px");
        })

        .on("mouseout", function() {
            d3.select(this).attr("r", 8);
            tooltip.style("visibility", "hidden");
        });

    var initialZoomDone = false;

    simulation
        .nodes(nodes)
        .on("tick", ticked)
        .on("end", function() {initialZoomDone = true;});

    simulation.force("link")
        .links(links);

    function ticked() {
        link.attr("d", positionLink);
        node.attr("transform", positionNode);
        if (!initialZoomDone) {
            zoomToFit();
        }
    }

    function positionLink(d) {
        return "M " + d[0].x + "," + d[0].y
            + " S" + d[1].x + "," + d[1].y
            + " " + d[2].x + "," + d[2].y;
    }

    function positionNode(d) {
        return "translate(" + d.x + "," + d.y + ")";
    }

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.03).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        tooltip.style("visibility", "hidden"); // hide while dragging a node
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    function zoomed() {
        everything.attr("transform", d3.event.transform);
    }

    function zoomToFit() {
        var bounds = everything.node().getBBox();
        var parent = everything.node().parentElement;
        var fullWidth = parent.clientWidth,
            fullHeight = parent.clientHeight;
        var width = bounds.width,
            height = bounds.height;
        var midX = bounds.x + width / 2,
            midY = bounds.y + height / 2;
        if (width == 0 || height == 0) return; // nothing to fit
        var scale = Math.min(1, (0.95 / Math.max(width / fullWidth, height / fullHeight)));
        var translateX = fullWidth / 2 - scale * midX;
        var translateY = fullHeight / 2 - scale * midY;

        svg.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
    }
}

function radioSelection(traversal) {
  var radioValue = $("input[name='traversal']:checked").val() || traversal;
  if (radioValue === 'depth') {
    $('#steps-dfs').show();
    $("#steps-input-dfs").prop( "disabled", false );
    $('#steps-bfs').hide();
    $("#steps-input-bfs").prop( "disabled", true );
  } else {
    $('#steps-dfs').hide();
    $("#steps-input-dfs").prop( "disabled", true );
    $('#steps-bfs').show();
    $("#steps-input-bfs").prop( "disabled", false );
  }
}

$( document ).ready(function() {
    radioSelection();
});
