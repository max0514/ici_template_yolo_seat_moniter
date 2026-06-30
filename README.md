# Library Visitors Flow Data Collection

## Project Description

Finding available study spaces on campus is a common problem for students. Many
students spend time walking across campus only to discover that study areas are
already full, while other areas remain underutilized. This lack of real-time
occupancy information leads to inefficient use of campus resources.

To address this issue, we developed **Smart Seat**, an AI-powered seat occupancy
detection system that combines Internet of Things (IoT) devices with computer
vision. The system uses ESP32-CAM cameras to capture images of study spaces and
applies the YOLOv8 object detection model to determine whether a seat is
occupied, temporarily unattended, or vacant. The detection results are processed
through a four-state decision model and displayed on a real-time web dashboard.

The project integrates AI, embedded systems, and web technologies to provide an
affordable and scalable solution for campus resource management. In addition to
real-time monitoring, the system also stores occupancy records in a database,
enabling future analysis and predictive resource management.

## Getting Started

### Hardware Requirements

- ESP32-CAM ×2
- CP2102 USB-to-Serial Adapter
- Jumper Wires
- Portable Power Bank
- Mounting Tape

### Software Requirements

- Python 3.10+
- Flask
- OpenCV
- YOLOv8 (Ultralytics)
- NumPy
- SQLite

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/max0514/ici_template_yolo_seat_moniter.git
cd ici_template_yolo_seat_moniter

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the web server (YOLOv8 weights download automatically on first run)
python app.py

# 4. Open the dashboard
#    http://127.0.0.1:5001/dashboard
```

Point the dashboard's camera URL at your ESP32-CAM capture endpoint
(e.g. `http://<esp32-ip>/capture`).

### File Structure

```
ici_template_yolo_seat_moniter/
├── app.py                          # Flask server: routes, inference, occupancy API
├── requirements.txt                # Python dependencies
├── occupancy/
│   └── engine.py                   # State-machine occupancy engine (hysteresis)
├── shared/
│   └── seat_schema.py              # Shared schema: Status, Seat, Detection, SeatState
├── templates/
│   ├── dashboard.html              # Real-time monitoring dashboard
│   ├── index.html                  # Detector page
│   ├── annotator.html              # Seat ROI annotator
│   └── history.html                # Historical occupancy view
├── static/
│   ├── script.js                   # Detector frontend logic
│   ├── history.js                  # History charts
│   ├── annotator.js                # ROI annotation tool
│   └── style.css                   # Styles
├── tests/
│   └── test_occupancy_contract.py  # Occupancy contract tests
├── contracts/                      # Module contracts (occupancy, dashboard)
├── CONSTITUTION.md                 # Project rules and tech stack
└── seat-monitoring.spec.md         # System specification
```

## Analysis

The Smart Seat system consists of four major stages.

### 1. Image Collection

Two ESP32-CAM devices continuously capture images of designated study seats.
Since the cameras are powered by portable power banks, the system can be deployed
without modifying existing campus infrastructure.

### 2. Object Detection

Captured images are processed using the YOLOv8n object detection model. The model
detects people and personal belongings such as laptops or bags within predefined
seat regions.

### 3. Seat State Classification

Detection results are analyzed using a four-state state machine:

- **Vacant** — No person or belongings detected.
- **Occupied** — A person is present or belongings indicate active seat usage.
- **Away** — The person has left, but belongings remain at the seat.
- **Flagged** — Belongings remain unattended for more than one hour, indicating
  possible illegal seat occupation.

### 4. Real-Time Monitoring

The occupancy status is transmitted to a Flask web server, which displays:

- Live camera feed
- Current occupied seat count
- Historical occupancy records stored in SQLite

## Results

The Smart Seat prototype was successfully deployed in a university dormitory
environment. The system demonstrated that:

- YOLOv8 can perform real-time seat occupancy detection.
- Occupancy information can be displayed instantly through a web dashboard.
- Every detection result is logged into an SQLite database for future analysis.
- The entire system can be implemented with hardware costing less than USD $50.

The prototype validates the feasibility of combining AI and IoT technologies for
smart campus applications.

## GitHub Link

https://github.com/max0514/yolo-seat-monitor.git

## Contributors

All team members contributed to project planning, implementation, testing, and
presentation.

- Ouyang
- Max
- Lucas
- Brian
- Joseph

## Acknowledgments

- **Professor Chung-pei Pien** (ICI, NCCU) for project guidance, topic
  suggestion, and feedback throughout the semester.

## References

1. Jocher, G., Chaurasia, A., & Qiu, J. (2023). *Ultralytics YOLOv8* (Version
   8.0.0) [Computer software]. https://github.com/ultralytics/ultralytics
2. Redmon, J., Divvala, S., Girshick, R., & Farhadi, A. (2016). You Only Look
   Once: Unified, Real-Time Object Detection. *Proceedings of the IEEE
   Conference on Computer Vision and Pattern Recognition (CVPR)*, 779–788.
3. Bradski, G. (2000). The OpenCV Library. *Dr. Dobb's Journal of Software
   Tools*. https://opencv.org
4. Pallets Projects. (2010). *Flask: A lightweight WSGI web application
   framework* [Computer software]. https://flask.palletsprojects.com
5. Espressif Systems. (2023). *ESP32-CAM Development Board — Technical
   Reference Manual*. https://www.espressif.com
6. SQLite Consortium. *SQLite Documentation*. https://www.sqlite.org/docs.html
7. Harris, C. R., et al. (2020). Array programming with NumPy. *Nature*, 585,
   357–362. https://doi.org/10.1038/s41586-020-2649-2
